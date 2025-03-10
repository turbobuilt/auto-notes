<script lang="ts" setup>
import { checkAndShowHttpError } from '@/lib/checkAndShowHttpError';
import router from '@/router'
import { serverMethods } from '@/serverMethods';
import type { VideoCall } from '@/serverTypes/videoCall/VideoCall.model';
import { store } from '@/store';
import { onMounted, ref, reactive, computed, onUnmounted, watch } from 'vue'
import { initVideoCallWebSocket, sendVideoCallMessage } from '@/lib/videoCallWebSocket';
import { VideoCallSignaling } from '@/lib/videoCallSignaling';
import { WebRTCService } from '@/lib/webrtcService';

console.log(store.user)
// Create a non-reactive reference for WebRTCService
let rtcService: WebRTCService | null = null;

const d = reactive({
    videoCall: null as VideoCall,
    loading: true,
    connectionId: store.user.id + "_" + Math.random(),
    wsService: null,
    wsConnected: false,
    events: [] as Array<{type: string, data: any, time: Date}>,
    signaling: null as VideoCallSignaling | null,
    localStream: null as MediaStream | null,
    remoteStreams: [] as MediaStream[],
    remoteConnectionIds: [] as string[],
    isVideoEnabled: true,
    isAudioEnabled: true,
    isScreenSharing: false,
    originalStream: null as MediaStream | null,
    isCopied: false,
    isMobile: window.innerWidth <= 768
})

// Create reactive refs specifically for those values that need to be reactive
const localStream = ref<MediaStream | null>(null);
const remoteStreams = ref<{id: string, stream: MediaStream}[]>([]);

const videoContainerRef = ref<HTMLDivElement | null>(null);
const localVideoRef = ref<HTMLVideoElement | null>(null);
const shareUrl = computed(() => window.location.href);
const routeId = computed(() => (router.currentRoute.value?.params as any).id);

// Handle new remote stream
const handleRemoteStreamAdded = (connectionId: string, stream: MediaStream) => {
    console.log(`Remote stream added from ${connectionId}`, stream);
    
    // Check if we already have this stream
    const existingIndex = remoteStreams.value.findIndex(s => s.id === connectionId);
    
    if (existingIndex >= 0) {
        // Update existing stream
        remoteStreams.value[existingIndex].stream = stream;
    } else {
        // Add new stream
        remoteStreams.value.push({ id: connectionId, stream });
    }
    
    // Update the d object for reactive purposes
    d.remoteStreams = remoteStreams.value.map(s => s.stream);
    d.remoteConnectionIds = remoteStreams.value.map(s => s.id);
    
    // Update video elements
    updateRemoteVideos();
}

onMounted(async () => {
    await router.isReady();
    if (routeId.value === 'new') {
        await createVideoCall();
        router.replace({ params: { id: d.videoCall.id } });
    } else {
        let result = await serverMethods.videoCall.get(routeId.value);
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
            rtcService = await d.signaling.initialize(d.connectionId);
            
            // Set remote stream handler
            if (rtcService) {
                rtcService.setOnRemoteStreamAdded(handleRemoteStreamAdded);
            }
            
            // Save local stream reference
            localStream.value = rtcService.getLocalMediaStream();
            d.localStream = localStream.value;
            
            // Set the local video element's srcObject
            if (localVideoRef.value && localStream.value) {
                localVideoRef.value.srcObject = localStream.value;
            }
            
            // Set up polling to check for new connections (backup for missing events)
            const connectionPoller = setInterval(() => {
                if (!rtcService) {
                    clearInterval(connectionPoller);
                    return;
                }
                
                const connections = rtcService.getConnectionsWithRemoteStreams();
                for (const conn of connections) {
                    // Add any missing streams
                    if (conn.remoteStream && 
                        !remoteStreams.value.some(s => s.id === conn.connectionId)) {
                        handleRemoteStreamAdded(conn.connectionId, conn.remoteStream);
                    }
                }
            }, 2000);
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

    // Perform cleanup on the non-reactive rtcService
    if (rtcService) {
        rtcService.closeAllConnections();
        rtcService = null;
    }
    
    // Clean up video elements
    cleanupVideoElements();
})

function cleanupVideoElements() {
    if (!videoContainerRef.value) return;
    
    // Remove all remote video elements
    const remoteVideos = videoContainerRef.value.querySelectorAll('.video-item:not(.local-video-container)');
    remoteVideos.forEach(el => el.remove());
}

function updateRemoteVideos() {
    if (!videoContainerRef.value) return;
    
    // Clean up any stale video elements
    cleanupVideoElements();
    
    // Create video elements for each remote stream
    remoteStreams.value.forEach((streamData, index) => {
        const { id, stream } = streamData;
        
        // Create container div
        const containerDiv = document.createElement('div');
        containerDiv.className = 'video-item';
        containerDiv.dataset.connectionId = id;
        
        // Create video element
        const videoEl = document.createElement('video');
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.srcObject = stream;
        
        // Create label
        const labelDiv = document.createElement('div');
        labelDiv.className = 'video-label';
        labelDiv.textContent = `Participant ${index + 1}`;
        
        // Add elements to container
        containerDiv.appendChild(videoEl);
        containerDiv.appendChild(labelDiv);
        
        // Add to grid
        videoContainerRef.value!.appendChild(containerDiv);
    });
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
    if (rtcService) {
        rtcService.toggleAudio(d.isAudioEnabled);
    }
}

// Toggle video
function toggleVideo() {
    d.isVideoEnabled = !d.isVideoEnabled;
    if (rtcService) {
        rtcService.toggleVideo(d.isVideoEnabled);
    }
}

// Start screen sharing
async function startScreenSharing() {
    try {
        if (!rtcService) return;
        
        // Save original stream for later
        d.originalStream = localStream.value;
        
        // Get screen share stream
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true
        });
        
        // Update local stream reference
        localStream.value = screenStream;
        d.localStream = screenStream;
        
        // Update local video
        if (localVideoRef.value) {
            localVideoRef.value.srcObject = screenStream;
        }
        
        // Replace tracks in all peer connections
        const videoTrack = screenStream.getVideoTracks()[0];
        const connections = rtcService.getConnections();
        
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
        if (!rtcService || !d.originalStream || !localStream.value) return;
        
        // Stop all tracks in screen sharing stream
        localStream.value.getTracks().forEach(track => track.stop());
        
        // Restore original stream
        localStream.value = d.originalStream;
        d.localStream = d.originalStream;
        d.originalStream = null;
        
        // Update local video
        if (localVideoRef.value) {
            localVideoRef.value.srcObject = localStream.value;
        }
        
        // Replace tracks in all peer connections
        const videoTrack = localStream.value.getVideoTracks()[0];
        const connections = rtcService.getConnections();
        
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
        <div v-if="d.loading || !d.videoCall" class="loading">Loading...</div>
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
                <h3>Participants ({{ d.videoCall.connections ? d.videoCall.connections.filter(c => c !== null).length : 0 }})</h3>
                <ul>
                    <li v-for="(conn, index) in d.videoCall.connections.filter(c => c !== null)" :key="index">
                        {{ conn === d.connectionId ? conn + ' (You)' : conn }}
                        <span v-if="d.remoteConnectionIds.includes(conn)" class="connected-badge">Connected</span>
                    </li>
                </ul>
                <p v-if="d.remoteStreams.length > 0" class="success-message">
                    {{ d.remoteStreams.length }} remote stream(s) connected
                </p>
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

<style scoped src="./video-call.scss"></style>