<script lang="ts" setup>
import { checkAndShowHttpError } from '@/lib/checkAndShowHttpError';
import router from '@/router'
import { serverMethods } from '@/serverMethods';
import type { VideoCall } from '@/serverTypes/videoCall/VideoCall.model';
import { store } from '@/store';
import { onMounted, ref, reactive, computed, onUnmounted } from 'vue'
import { initVideoCallWebSocket, sendVideoCallMessage } from '@/lib/videoCallWebSocket';
import { VideoCallSignaling } from '@/lib/videoCallSignaling';
import { WebRTCService } from '@/lib/webrtcService';

console.log(store.user)
const d = reactive({
    videoCall: null as VideoCall,
    loading: true,
    connectionId: store.user.id + "_" + Math.random(),
    wsService: null,
    wsConnected: false,
    events: [] as Array<{type: string, data: any, time: Date}>,
    rtcService: null as WebRTCService | null,
    signaling: null as VideoCallSignaling | null,
    localStream: null as MediaStream | null,
    remoteStreams: [] as MediaStream[],
    isVideoEnabled: true,
    isAudioEnabled: true,
    isScreenSharing: false,
    originalStream: null as MediaStream | null,
    isCopied: false,
    isMobile: window.innerWidth <= 768
})

const videoContainerRef = ref<HTMLDivElement | null>(null);
const localVideoRef = ref<HTMLVideoElement | null>(null);
const shareUrl = computed(() => window.location.href);
const routeId = computed(() => (router.currentRoute.value?.params as any).id);

onMounted(async () => {
    await router.isReady();
    if (routeId.value === 'new') {
        await createVideoCall();
        router.replace({ params: { id: d.videoCall.id } });
    } else {
        let result = await serverMethods.videoCall.get(routeId.value, d.connectionId);
        if (await checkAndShowHttpError(result))
            return;
        d.videoCall = result.data.videoCall;
    }
    d.loading = false;
    
    // Initialize WebSocket after we have the video call data
    d.wsService = await initVideoCallWebSocket(d.connectionId, d);
    
    // Initialize signaling service
    if (d.wsService && d.videoCall) {
        d.signaling = new VideoCallSignaling(d.wsService, d);
        
        // Initialize WebRTC
        try {
            // Join the call
            await sendMessage('join', { connectionId: d.connectionId });
            
            // Initialize WebRTC and signaling
            d.rtcService = await d.signaling.initialize(d.connectionId);
            
            // Save local stream reference
            d.localStream = d.rtcService.getLocalMediaStream();
            
            // Set the local video element's srcObject
            if (localVideoRef.value && d.localStream) {
                localVideoRef.value.srcObject = d.localStream;
            }
            
            // Watch for new remote streams
            setInterval(() => {
                if (d.rtcService) {
                    const connections = d.rtcService.getConnections();
                    const newStreams = connections.map(conn => conn.remoteStream);
                    
                    // Only update if there's a change
                    if (JSON.stringify(d.remoteStreams) !== JSON.stringify(newStreams)) {
                        d.remoteStreams = newStreams;
                        
                        // Update remote videos in next tick
                        setTimeout(updateRemoteVideos, 0);
                    }
                }
            }, 1000);
        } catch (error) {
            console.error('Error setting up WebRTC:', error);
            d.events.push({
                type: 'error',
                data: `WebRTC setup error: ${error.message || error}`,
                time: new Date()
            });
        }
    }
})

onUnmounted(() => {
    // Leave the call
    if (d.wsConnected && d.videoCall) {
        sendMessage('leave', { connectionId: d.connectionId })
            .catch(console.error);
    }
    
    // Clean up WebRTC
    if (d.signaling) {
        d.signaling.cleanup();
    }
    
    // Clean up WebSocket connection
    if (d.wsService) {
        d.wsService.disconnect();
    }
    
    // Stop screen sharing if active
    if (d.isScreenSharing && d.originalStream) {
        stopScreenSharing();
    }
})

function updateRemoteVideos() {
    if (!videoContainerRef.value) return;
    
    // Find all remote video elements
    const remoteVideos = videoContainerRef.value.querySelectorAll('.remote-video');
    
    // For each remote stream, find or create a video element
    d.remoteStreams.forEach((stream, index) => {
        let videoEl: HTMLVideoElement;
        
        if (index < remoteVideos.length) {
            // Use existing video element
            videoEl = remoteVideos[index] as HTMLVideoElement;
        } else {
            // Create a new video element
            videoEl = document.createElement('video');
            videoEl.classList.add('remote-video');
            videoEl.autoplay = true;
            videoEl.playsInline = true;
            videoContainerRef.value!.appendChild(videoEl);
        }
        
        // Set the stream if it's different
        if (videoEl.srcObject !== stream) {
            videoEl.srcObject = stream;
        }
    });
    
    // Remove excess video elements
    for (let i = d.remoteStreams.length; i < remoteVideos.length; i++) {
        remoteVideos[i].remove();
    }
}

async function createVideoCall() {
    let result = await serverMethods.videoCall.create([d.connectionId]);
    d.loading = false;
    if (await checkAndShowHttpError(result))
        return;
    d.videoCall = result.data.videoCall;
}

// Helper function to send message through WebSocket
async function sendMessage(type: string, data: any) {
    return sendVideoCallMessage(
        d.wsService, 
        d.wsConnected, 
        d.videoCall.id, 
        type, 
        data
    );
}

// Toggle audio
function toggleAudio() {
    d.isAudioEnabled = !d.isAudioEnabled;
    if (d.rtcService) {
        d.rtcService.toggleAudio(d.isAudioEnabled);
    }
}

// Toggle video
function toggleVideo() {
    d.isVideoEnabled = !d.isVideoEnabled;
    if (d.rtcService) {
        d.rtcService.toggleVideo(d.isVideoEnabled);
    }
}

// Start screen sharing
async function startScreenSharing() {
    try {
        if (!d.rtcService) return;
        
        // Save original stream for later
        d.originalStream = d.localStream;
        
        // Get screen share stream
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true
        });
        
        // Update local stream reference
        d.localStream = screenStream;
        
        // Update local video
        if (localVideoRef.value) {
            localVideoRef.value.srcObject = screenStream;
        }
        
        // Replace tracks in all peer connections
        const videoTrack = screenStream.getVideoTracks()[0];
        const connections = d.rtcService.getConnections();
        
        for (const conn of connections) {
            const senders = conn.connection.getSenders();
            const sender = senders.find(s => s.track && s.track.kind === 'video');
            if (sender) {
                await sender.replaceTrack(videoTrack);
            }
        }
        
        d.isScreenSharing = true;
        
        // Set up track ended event
        videoTrack.onended = () => {
            stopScreenSharing();
        };
    } catch (error) {
        console.error('Error starting screen share:', error);
    }
}

// Stop screen sharing
async function stopScreenSharing() {
    try {
        if (!d.rtcService || !d.originalStream || !d.localStream) return;
        
        // Stop all tracks in screen sharing stream
        d.localStream.getTracks().forEach(track => track.stop());
        
        // Restore original stream
        d.localStream = d.originalStream;
        d.originalStream = null;
        
        // Update local video
        if (localVideoRef.value) {
            localVideoRef.value.srcObject = d.localStream;
        }
        
        // Replace tracks in all peer connections
        const videoTrack = d.localStream.getVideoTracks()[0];
        const connections = d.rtcService.getConnections();
        
        for (const conn of connections) {
            const senders = conn.connection.getSenders();
            const sender = senders.find(s => s.track && s.track.kind === 'video');
            if (sender) {
                await sender.replaceTrack(videoTrack);
            }
        }
        
        d.isScreenSharing = false;
    } catch (error) {
        console.error('Error stopping screen share:', error);
    }
}

// Copy invite link
function copyInviteLink() {
    navigator.clipboard.writeText(shareUrl.value)
        .then(() => {
            d.isCopied = true;
            setTimeout(() => {
                d.isCopied = false;
            }, 2000);
        })
        .catch(console.error);
}
</script>
<template>
    <div class="video-call-container">
        <div v-if="d.loading" class="loading">Loading...</div>
        <div v-else>
            <div class="call-info">
                <h2>Video Call: {{ d.videoCall.id }}</h2>
                <div class="connection-status" :class="{ connected: d.wsConnected }">
                    WebSocket: {{ d.wsConnected ? 'Connected' : 'Disconnected' }}
                </div>
            </div>
            
            <div class="share-link">
                <p>Share this link to invite others:</p>
                <div class="link-container">
                    <input type="text" readonly :value="shareUrl" />
                    <button @click="copyInviteLink">
                        {{ d.isCopied ? 'Copied!' : 'Copy' }}
                    </button>
                </div>
            </div>
            
            <div class="video-grid" ref="videoContainerRef">
                <div class="video-item local-video-container">
                    <video ref="localVideoRef" autoplay muted playsinline></video>
                    <div class="video-label">
                        You ({{ d.isScreenSharing ? 'Screen Sharing' : 'Camera' }})
                    </div>
                </div>
                <!-- Remote video elements will be added dynamically -->
            </div>
            
            <div class="video-controls">
                <button 
                    @click="toggleAudio" 
                    :class="{ 'control-disabled': !d.isAudioEnabled }">
                    {{ d.isAudioEnabled ? 'Mute' : 'Unmute' }}
                </button>
                <button 
                    @click="toggleVideo" 
                    :class="{ 'control-disabled': !d.isVideoEnabled }">
                    {{ d.isVideoEnabled ? 'Hide Video' : 'Show Video' }}
                </button>
                <button 
                    @click="d.isScreenSharing ? stopScreenSharing() : startScreenSharing()"
                    :class="{ 'control-active': d.isScreenSharing }">
                    {{ d.isScreenSharing ? 'Stop Sharing' : 'Share Screen' }}
                </button>
            </div>
            
            <div class="connection-info">
                <h3>Participants ({{ d.videoCall.connections ? d.videoCall.connections.length : 0 }})</h3>
                <ul>
                    <li v-for="(conn, index) in d.videoCall.connections" :key="index">
                        {{ conn === d.connectionId ? conn + ' (You)' : conn }}
                    </li>
                </ul>
            </div>
            
            <div class="events-log">
                <h3>Events</h3>
                <div v-for="(event, index) in d.events" :key="index" class="event-item">
                    <span class="event-time">{{ event.time.toLocaleTimeString() }}</span>
                    <span class="event-type">{{ event.type }}</span>
                    <pre class="event-data">{{ JSON.stringify(event.data, null, 2) }}</pre>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.video-call-container {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
}

.loading {
    text-align: center;
    padding: 20px;
    font-size: 1.2em;
}

.call-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}

.connection-status {
    padding: 5px 10px;
    border-radius: 4px;
    background-color: #f44336;
    color: white;
    font-weight: bold;
}

.connection-status.connected {
    background-color: #4caf50;
}

.share-link {
    margin-bottom: 20px;
    padding: 10px;
    background-color: #f8f9fa;
    border-radius: 8px;
}

.link-container {
    display: flex;
}

.link-container input {
    flex: 1;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px 0 0 4px;
    outline: none;
}

.link-container button {
    padding: 8px 16px;
    background-color: #4285f4;
    color: white;
    border: none;
    border-radius: 0 4px 4px 0;
    cursor: pointer;
}

.video-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    margin-bottom: 20px;
}

.video-item {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    background-color: #000;
    aspect-ratio: 16 / 9;
}

.video-item video {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.video-label {
    position: absolute;
    bottom: 10px;
    left: 10px;
    padding: 5px 10px;
    background-color: rgba(0, 0, 0, 0.6);
    color: white;
    border-radius: 4px;
}

.video-controls {
    display: flex;
    justify-content: center;
    gap: 15px;
    margin-bottom: 20px;
}

.video-controls button {
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    background-color: #4285f4;
    color: white;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
}

.video-controls button:hover {
    background-color: #3367d6;
}

.video-controls .control-disabled {
    background-color: #f44336;
}

.video-controls .control-disabled:hover {
    background-color: #d32f2f;
}

.video-controls .control-active {
    background-color: #fb8c00;
}

.video-controls .control-active:hover {
    background-color: #f57c00;
}

.connection-info {
    margin-bottom: 20px;
    padding: 15px;
    background-color: #f8f9fa;
    border-radius: 8px;
}

.connection-info ul {
    list-style: none;
    padding: 0;
    margin: 10px 0 0;
}

.connection-info li {
    padding: 5px 0;
    border-bottom: 1px solid #eee;
}

.events-log {
    margin-top: 20px;
    padding: 15px;
    background-color: #f8f9fa;
    border-radius: 8px;
    max-height: 300px;
    overflow-y: auto;
}

.event-item {
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
}

.event-time {
    font-size: 0.8em;
    color: #666;
    margin-right: 10px;
}

.event-type {
    font-weight: bold;
    color: #4285f4;
    margin-right: 10px;
}

.event-data {
    margin-top: 5px;
    padding: 8px;
    background-color: #eee;
    border-radius: 4px;
    font-size: 0.9em;
    white-space: pre-wrap;
    overflow-x: auto;
}

@media (max-width: 768px) {
    .video-grid {
        grid-template-columns: 1fr;
    }
    
    .video-controls {
        flex-wrap: wrap;
    }
    
    .video-controls button {
        flex: 1;
        min-width: 100px;
    }
    
    .link-container {
        flex-direction: column;
    }
    
    .link-container input {
        border-radius: 4px 4px 0 0;
    }
    
    .link-container button {
        border-radius: 0 0 4px 4px;
    }
}
</style>