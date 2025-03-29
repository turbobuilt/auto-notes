<script lang="ts" setup>
import { checkAndShowHttpError } from '@/lib/checkAndShowHttpError';
import router from '@/router'
import { serverMethods } from '@/serverMethods';
import type { VideoCall } from '@/serverTypes/videoCall/VideoCall.model';
import { store } from '@/store';
import { onMounted, ref, reactive, computed, onUnmounted } from 'vue'
import { initVideoCallWebSocket, joinVideoCall, sendVideoCallMessage } from '@/lib/videoCallWebSocket';
import { VideoCallSignaling } from '@/lib/videoCallSignaling';
import { WebRTCService } from '@/lib/webrtcService';
import VideoParticipant from '@/components/VideoParticipant.vue';

console.log("user is", store.user)

// Plain (non-reactive) variables for media and WebRTC related objects
let rtcService: WebRTCService | null = null;
let signaling: VideoCallSignaling | null = null;
let wsService: any = null;

// Reactive data for UI state only
const d = reactive({
    videoCall: null as VideoCall,
    loading: true,
    connectionId: store.user?.id + "_" + Math.random(),
    wsConnected: false,
    events: [] as Array<{ type: string, data: any, time: Date }>,
    remoteConnectionIds: [] as string[],
    isCopied: false,
    isMobile: window.innerWidth <= 768,
    hasRemoteConnections: false,
    mediaLoading: true, // New flag to track media loading state
    loadingStage: 'initializing', // New property to track loading stage
    error: null as string | null, // To track errors during initialization
    connectionTimeout: false, // Flag for connection timeout
})

// Define the missing reactive variables
const remoteStreams = ref<Array<{ id: string, stream: MediaStream }>>([]);
const selectedRemoteStream = ref<{ id: string, stream: MediaStream } | null>(null);
const showLocalVideoInCenter = computed(() => remoteStreams.value.length === 0 && !selectedRemoteStream.value);
const shareUrl = computed(() => `${window.location.origin}/app/video-call/${d.videoCall?.id}`);

// Track connection statuses
const connectionStatuses = reactive(new Map<string, 'active' | 'stale' | 'dead'>());

// Refs for UI controls
const isVideoEnabled = ref<boolean>(true);
const isAudioEnabled = ref<boolean>(true);
const isScreenSharing = ref<boolean>(false);

// Add timeout handling
let connectionTimeoutId: number | null = null;

// Get local stream for UI display - uses rtcService as source of truth
const localStream = computed(() => rtcService?.localStream || null);

const routeId = computed(() => (router.currentRoute?.value?.params as any)?.id as string);

// Define the missing handler functions
function handleRemoteStreamAdded(connectionId: string, stream: MediaStream) {
    console.log(`Remote stream added from ${connectionId}`);
    
    // Check if this stream is already in our list
    const existingIndex = remoteStreams.value.findIndex(s => s.id === connectionId);
    
    if (existingIndex >= 0) {
        // Replace the existing stream
        remoteStreams.value[existingIndex] = { id: connectionId, stream };
    } else {
        // Add the new stream
        remoteStreams.value.push({ id: connectionId, stream });
        
        // Auto-select the first remote stream we receive if nothing is currently selected
        // This ensures the remote stream is displayed in the main view automatically
        if (!selectedRemoteStream.value && remoteStreams.value.length === 1) {
            selectRemoteStream(remoteStreams.value[0]);
        }
    }
    
    // Update remote connections flag
    d.hasRemoteConnections = remoteStreams.value.length > 0 || !!selectedRemoteStream.value;
    
    // Log the event
    d.events.push({
        type: 'stream',
        data: { connectionId, action: 'added' },
        time: new Date()
    });
}

function handleConnectionStatusChanged(connectionId: string, status: 'active' | 'stale' | 'dead') {
    console.log(`Connection status changed for ${connectionId}: ${status}`);
    
    // Update status in our reactive map
    connectionStatuses.set(connectionId, status);
    
    // If the connection is dead, remove it from our streams
    if (status === 'dead') {
        // Check if it's the selected stream
        if (selectedRemoteStream.value && selectedRemoteStream.value.id === connectionId) {
            selectedRemoteStream.value = null;
        }
        
        // Remove from remote streams list
        const index = remoteStreams.value.findIndex(s => s.id === connectionId);
        if (index >= 0) {
            remoteStreams.value.splice(index, 1);
        }
        
        // Update connection flags
        d.hasRemoteConnections = remoteStreams.value.length > 0 || !!selectedRemoteStream.value;
    }
    
    // Log the event
    d.events.push({
        type: 'connection',
        data: { connectionId, status },
        time: new Date()
    });
}

// Modified onMounted to separate media initialization and connection setup
onMounted(async () => {
    await router.isReady();
    
    console.log("Video call component mounted, setting up...");
    
    // Set a timeout to prevent infinite loading
    connectionTimeoutId = window.setTimeout(() => {
        console.warn("Connection attempt timed out");
        d.connectionTimeout = true;
        d.loading = false;
        d.error = "Connection timed out. Please try refreshing the page.";
    }, 15000); // 15 second timeout
    
    try {
        let websocketPromise = initVideoCallWebSocket(d.connectionId, d);
        // Create WebRTC service first
        rtcService = new WebRTCService((signal) => {
            // This will be replaced when signaling is initialized
            console.log("Signal callback called before initialization:", signal);
        });
        
        // Start media initialization early
        d.loadingStage = 'accessing camera';
        d.mediaLoading = true;
        try {
            await rtcService.startLocalStream(true, true);
        } catch (error) {
            console.error('Error initializing local media:', error);
            d.events.push({
                type: 'error',
                data: `Media initialization error: ${error.message || error}`,
                time: new Date()
            });
            d.error = `Media error: ${error.message || 'Could not access camera/microphone'}`;
            // Continue without media
        } finally {
            d.mediaLoading = false;
        }
        
        // Initialize WebSocket in parallel
        d.loadingStage = 'connecting to server';
        console.log("Initializing WebSocket...");
        wsService = await websocketPromise;
        console.log("WebSocket initialized:", wsService);
        
        if (routeId.value === 'new') {
            d.loadingStage = 'creating new call';
            console.log("Creating new video call...");
            await createVideoCall();
            router.replace({ params: { id: d.videoCall.id } });
            console.log("New call created:", d.videoCall);
        } else {
            d.loadingStage = 'joining existing call';
            console.log("Joining existing call:", routeId.value);
            // Join the existing call directly via WebSocket
            try {
                await setTimeout(() => {}, 1000); // Simulate delay for WebSocket connection
                const result = await joinVideoCall(wsService, routeId.value, d.connectionId);
                console.log("Joined call via WebSocket:", result);
                d.videoCall = result.videoCall;
    
                // Log active connections
                d.events.push({
                    type: 'system',
                    data: { message: `Joined call with ${result.activeConnections?.length || 0} active connections` },
                    time: new Date()
                });
            } catch (error) {
                console.error("Error joining video call:", error);
                d.events.push({
                    type: 'error',
                    data: `Join error: ${error.message || error}`,
                    time: new Date()
                });
    
                // Try fallback to server method if WebSocket join fails
                console.log("Trying fallback API method...");
                let result = await serverMethods.videoCall.create([d.connectionId]);
                if (await checkAndShowHttpError(result)) {
                    throw new Error("Failed to create or join call");
                }
                d.videoCall = result.data.videoCall;
            }
        }
    
        // Clear timeout as we've successfully connected
        if (connectionTimeoutId) {
            clearTimeout(connectionTimeoutId);
            connectionTimeoutId = null;
        }
        
        d.loading = false;
        d.loadingStage = 'setting up media';
        console.log("Initial loading complete, setting up media...");
    
        // Initialize signaling service with existing rtcService
        if (wsService && d.videoCall && rtcService) {
            d.loadingStage = 'establishing connections';
            signaling = new VideoCallSignaling(wsService, d, rtcService);
    
            // Initialize WebRTC connections but skip media initialization 
            // since we already did it separately
            try {
                // Join the call
                await sendMessage('join', { connectionId: d.connectionId });
    
                // Initialize WebRTC connections with existing participants
                await signaling.initialize(d.connectionId, 3, true); // Skip media initialization
    
                // Set remote stream handler
                if (rtcService) {
                    rtcService.setOnRemoteStreamAdded(handleRemoteStreamAdded);
                    rtcService.setOnConnectionStatusChanged(handleConnectionStatusChanged);
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
                
                d.loadingStage = 'ready';
                console.log("Video call setup complete");
            } catch (error) {
                console.error('Error setting up WebRTC:', error);
                d.events.push({
                    type: 'error',
                    data: `WebRTC setup error: ${error.message || error}`,
                    time: new Date()
                });
                d.error = `Connection error: ${error.message || 'Could not establish video connection'}`;
            }
        }
    } catch (error) {
        console.error("Fatal error during video call setup:", error);
        d.error = `Error: ${error.message || 'Something went wrong'}`;
        d.loading = false;
        
        // Clear timeout if it exists
        if (connectionTimeoutId) {
            clearTimeout(connectionTimeoutId);
            connectionTimeoutId = null;
        }
    }
})

onUnmounted(() => {
    // Clear any pending timeouts
    if (connectionTimeoutId) {
        clearTimeout(connectionTimeoutId);
        connectionTimeoutId = null;
    }
    
    // Leave the call
    if (d.wsConnected && d.videoCall) {
        sendMessage('leave', { connectionId: d.connectionId })
            .catch(console.error);
    }

    // Clean up WebRTC
    if (signaling) {
        signaling.cleanup();
        signaling = null;
    }

    // Clean up WebSocket connection
    if (wsService) {
        wsService.disconnect();
        wsService = null;
    }

    // Perform cleanup on rtcService - this will stop all streams
    if (rtcService) {
        rtcService.closeAllConnections();
        rtcService = null;
    }
})

// Function to select a remote stream as the main view
function selectRemoteStream(streamData: { id: string, stream: MediaStream }) {
    // If we have a currently selected stream and it's not the one being selected,
    // we need to swap them
    if (selectedRemoteStream.value && selectedRemoteStream.value.id !== streamData.id) {
        // Add current selected stream back to the sidebar (if it's not already there)
        if (!remoteStreams.value.some(s => s.id === selectedRemoteStream.value!.id)) {
            remoteStreams.value.push(selectedRemoteStream.value);
        }
    }

    // Set the new selected stream
    selectedRemoteStream.value = streamData;

    // Remove the selected stream from the sidebar list
    const index = remoteStreams.value.findIndex(s => s.id === streamData.id);
    if (index >= 0) {
        remoteStreams.value.splice(index, 1);
    }
}

// Track if controls are visible
const controlsVisible = ref(false);
let hideControlsTimeout: number | null = null;

// Function to show controls
function showControls() {
    controlsVisible.value = true;

    // Clear any existing timeout
    if (hideControlsTimeout) {
        clearTimeout(hideControlsTimeout);
    }

    // Set a new timeout to hide controls after 3 seconds
    hideControlsTimeout = window.setTimeout(() => {
        controlsVisible.value = false;
        hideControlsTimeout = null;
    }, 3000);
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
        wsService,
        d.wsConnected,
        d.videoCall.id,
        type,
        data
    );
}

// Toggle audio
function toggleAudio() {
    isAudioEnabled.value = !isAudioEnabled.value;
    if (rtcService) {
        rtcService.toggleAudio(isAudioEnabled.value);
    }
}

// Toggle video
function toggleVideo() {
    isVideoEnabled.value = !isVideoEnabled.value;
    if (rtcService) {
        rtcService.toggleVideo(isVideoEnabled.value);
    }
}

// Start screen sharing
async function startScreenSharing() {
    try {
        if (!rtcService) return;
        
        const success = await rtcService.startScreenSharing();
        if (success) {
            isScreenSharing.value = true;
            
            // Listen for screen share ending
            const videoTrack = rtcService.localStream?.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.onended = () => {
                    stopScreenSharing();
                };
            }
        }
    } catch (error) {
        console.error('Error starting screen share:', error);
        d.events.push({
            type: 'error',
            data: `Screen sharing error: ${error.message || error}`,
            time: new Date()
        });
    }
}

// Stop screen sharing
async function stopScreenSharing() {
    try {
        if (!rtcService) return;
        
        await rtcService.stopScreenSharing();
        isScreenSharing.value = false;
    } catch (error) {
        console.error('Error stopping screen share:', error);
        d.events.push({
            type: 'error',
            data: `Screen sharing error: ${error.message || error}`,
            time: new Date()
        });
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

// Function to initialize local media when retry button is clicked
async function initializeLocalMedia() {
    try {
        d.mediaLoading = true;
        
        if (rtcService) {
            await rtcService.startLocalStream(true, true);
            d.error = null; // Clear any previous errors
        }
    } catch (error) {
        console.error('Error initializing media:', error);
        d.error = `Camera access failed: ${error.message || error}`;
    } finally {
        d.mediaLoading = false;
    }
}
function reload() {
    window.location.reload()
}
// Helper function to count total active participants
function getTotalActiveParticipants() {
    return 1 + remoteStreams.value.length;
}
</script>

<template>
    <div class="video-call-container">
        <div v-if="d.loading || !d.videoCall" class="loading">
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">
                    <p>Loading video call... ({{ d.loadingStage }})</p>
                    
                    <!-- Display debug info for troubleshooting -->
                    <div v-if="d.connectionTimeout" class="loading-error">
                        Connection is taking longer than expected.
                        <button @click="reload">Refresh Page</button>
                    </div>
                </div>
            </div>
        </div>
        <div v-else-if="d.error" class="error-container">
            <div class="error-message">
                <h3>Error</h3>
                <p>{{ d.error }}</p>
                <button @click="reload">Try Again</button>
            </div>
        </div>
        <div v-else>
            <!-- Add media loading indicator -->
            <div v-if="d.mediaLoading" class="media-loading-overlay">
                <div class="media-loading-message">
                    <span class="loading-spinner"></span>
                    Initializing camera and microphone...
                </div>
            </div>
            
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

            <!-- Improved video layout using component -->
            <div class="video-layout" ref="videoContainerRef" :class="{ 'mobile-layout': d.isMobile }">
                <!-- Main section -->
                <div class="main-content" @mousemove="showControls">
                    <!-- No remote connections scenario: Local video centered -->
                    <div class="local-video-container"
                        :class="{ 'centered': showLocalVideoInCenter, 'floating': !showLocalVideoInCenter }">
                        <VideoParticipant v-if="localStream" :stream="localStream" :connection-id="d.connectionId"
                            :is-local="true" :is-screen-sharing="isScreenSharing"
                            :label="'You' + (isScreenSharing ? ' (Screen Sharing)' : '')"
                            :size="showLocalVideoInCenter ? 'main' : 'floating'" />
                    </div>

                    <!-- Selected remote stream -->
                    <div v-if="selectedRemoteStream" class="main-video-container">
                        <VideoParticipant :stream="selectedRemoteStream.stream" :connection-id="selectedRemoteStream.id"
                            :connection-status="connectionStatuses.get(selectedRemoteStream.id)"
                            label="Selected Participant" size="main" />
                    </div>

                    <!-- Hover controls -->
                    <div class="video-controls-overlay" :class="{ 'controls-visible': controlsVisible }">
                        <div class="video-controls">
                            <button @click="toggleAudio" :class="{ 'control-disabled': !isAudioEnabled }">
                                {{ isAudioEnabled ? 'Mute' : 'Unmute' }}
                            </button>
                            <button @click="toggleVideo" :class="{ 'control-disabled': !isVideoEnabled }">
                                {{ isVideoEnabled ? 'Hide Video' : 'Show Video' }}
                            </button>
                            <button @click="isScreenSharing ? stopScreenSharing() : startScreenSharing()"
                                :class="{ 'control-active': isScreenSharing }">
                                {{ isScreenSharing ? 'Stop Sharing' : 'Share Screen' }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Sidebar for additional videos - only show with more than 2 participants -->
                <div v-if="getTotalActiveParticipants() > 2" class="video-sidebar">
                    {{ getTotalActiveParticipants() }}
                    <!-- Map over remote streams array to display each one -->
                    <div v-for="streamData in remoteStreams" :key="streamData.id" class="video-thumbnail">
                        <VideoParticipant :stream="streamData.stream" :connection-id="streamData.id"
                            :connection-status="connectionStatuses.get(streamData.id)" size="sidebar"
                            @click="selectRemoteStream(streamData)" />
                    </div>
                </div>
            </div>

            <!-- Connection info section -->
            <div class="connection-info">
                <h3>Participants ({{d.videoCall.connections ? d.videoCall.connections.filter(c => c !== null).length :
                    0 }})</h3>
                <ul>
                    <li v-for="(conn, index) in d.videoCall.connections.filter(c => c !== null)" :key="index">
                        {{ conn === d.connectionId ? conn + ' (You)' : conn }}
                        <span v-if="d.remoteConnectionIds.includes(conn)" class="connected-badge">Connected</span>
                    </li>
                </ul>
                <p v-if="remoteStreams.length > 0" class="success-message">
                    {{ remoteStreams.length + (selectedRemoteStream ? 1 : 0) }} remote stream(s) connected
                </p>
                
                <!-- Show media status -->
                <div class="media-status">
                    <p>Media Status: {{ localStream ? 'Ready' : 'Not Available' }}</p>
                    <button v-if="!localStream" @click="initializeLocalMedia">Retry Camera Access</button>
                </div>
            </div>

            <!-- Events log -->
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

<style>
@import "./video-call.scss";

/* Add styles for media loading indicator */
.media-loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: rgba(0,0,0,0.7);
    color: white;
    padding: 10px;
    text-align: center;
    z-index: 1000;
    animation: fadeIn 0.3s;
}

/* Enhanced loading styles */
.loading {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(255, 255, 255, 0.9);
    z-index: 1000;
}

.loading-content {
    text-align: center;
    padding: 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.loading-spinner {
    display: inline-block;
    width: 40px;
    height: 40px;
    border: 4px solid rgba(0,0,0,0.1);
    border-radius: 50%;
    border-top-color: #0066cc;
    animation: spin 1s linear infinite;
    margin-bottom: 15px;
}

.loading-text {
    margin-top: 10px;
}

.loading-error {
    margin-top: 15px;
    color: #cc0000;
}

.error-container {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
}

.error-message {
    background: #fff1f0;
    border: 1px solid #ffa39e;
    padding: 20px;
    border-radius: 8px;
    text-align: center;
    max-width: 500px;
}

.error-message button {
    margin-top: 10px;
    padding: 8px 16px;
    background: #0066cc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

/* ...existing code... */
</style>