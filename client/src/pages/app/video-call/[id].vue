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

console.log(store.user)

// Plain (non-reactive) variables for media and WebRTC related objects
let rtcService: WebRTCService | null = null;
let signaling: VideoCallSignaling | null = null;
let localStream: MediaStream | null = null;
let originalStream: MediaStream | null = null;
let remoteStreams: { id: string, stream: MediaStream }[] = [];
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
})

// Track connection statuses
const connectionStatuses = reactive(new Map<string, 'active' | 'stale' | 'dead'>());

// Refs for UI controls
const isVideoEnabled = ref<boolean>(true);
const isAudioEnabled = ref<boolean>(true);
const isScreenSharing = ref<boolean>(false);

const videoContainerRef = ref<HTMLDivElement | null>(null);
const shareUrl = computed(() => window.location.href);
const routeId = computed(() => (router.currentRoute.value?.params as any).id);

// Add reactive reference for the selected remote stream
const selectedRemoteStream = ref<{ id: string, stream: MediaStream } | null>(null);

// This computed property will control local video animation state
const showLocalVideoInCenter = computed(() => {
    return !d.hasRemoteConnections || (remoteStreams.length === 0 && !selectedRemoteStream.value);
});

// Handle new remote stream
const handleRemoteStreamAdded = (connectionId: string, stream: MediaStream) => {
    console.log(`Remote stream added from ${connectionId}`, stream);

    // Check if we already have this stream
    const existingIndex = remoteStreams.findIndex(s => s.id === connectionId);

    if (existingIndex >= 0) {
        // Update existing stream
        remoteStreams[existingIndex].stream = stream;
    } else {
        // Add new stream
        remoteStreams.push({ id: connectionId, stream });

        // Auto-select the first remote stream that connects
        if (!selectedRemoteStream.value) {
            selectRemoteStream({ id: connectionId, stream });
        }
    }

    // Update the connection IDs list for UI
    d.remoteConnectionIds = remoteStreams.map(s => s.id);

    // Update the hasRemoteConnections flag to trigger animation
    d.hasRemoteConnections = true;

    // Initialize connection status as active
    connectionStatuses.set(connectionId, 'active');
}

// Handle connection status changes
const handleConnectionStatusChanged = (connectionId: string, status: 'active' | 'stale' | 'dead') => {
    console.log(`Connection status changed for ${connectionId}: ${status}`);

    // Update status in our tracking map
    connectionStatuses.set(connectionId, status);

    // Log the event
    d.events.push({
        type: 'connection',
        data: { connectionId, status },
        time: new Date()
    });

    // Automatically close dead connections after a short delay
    if (status === 'dead') {
        setTimeout(() => {
            // Check if status is still dead before closing
            if (connectionStatuses.get(connectionId) === 'dead') {
                closeDeadConnection(connectionId);
            }
        }, 1000); // Small delay to allow for recovery
    }
}

// Close a dead connection
const closeDeadConnection = (connectionId: string) => {
    console.log(`Closing dead connection: ${connectionId}`);

    // Check if this is our selected stream
    if (selectedRemoteStream.value && selectedRemoteStream.value.id === connectionId) {
        selectedRemoteStream.value = null;
    }

    // Remove connection from RTCService
    if (rtcService) {
        rtcService.closeConnection(connectionId);
    }

    // Remove from our tracking
    connectionStatuses.delete(connectionId);

    // Remove from remoteStreams array
    const index = remoteStreams.findIndex(s => s.id === connectionId);
    if (index >= 0) {
        remoteStreams.splice(index, 1);
        d.remoteConnectionIds = remoteStreams.map(s => s.id);
    }

    // If no more remote streams, update hasRemoteConnections
    if (remoteStreams.length === 0 && !selectedRemoteStream.value) {
        d.hasRemoteConnections = false;
    }
}

// Function to select a remote stream as the main view
function selectRemoteStream(streamData: { id: string, stream: MediaStream }) {
    // If we have a currently selected stream and it's not the one being selected,
    // we need to swap them
    if (selectedRemoteStream.value && selectedRemoteStream.value.id !== streamData.id) {
        // Add current selected stream back to the sidebar (if it's not already there)
        if (!remoteStreams.some(s => s.id === selectedRemoteStream.value!.id)) {
            remoteStreams.push(selectedRemoteStream.value);
        }
    }

    // Set the new selected stream
    selectedRemoteStream.value = streamData;

    // Remove the selected stream from the sidebar list
    const index = remoteStreams.findIndex(s => s.id === streamData.id);
    if (index >= 0) {
        remoteStreams.splice(index, 1);
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

onMounted(async () => {
    await router.isReady();

    // Initialize WebSocket first
    wsService = await initVideoCallWebSocket(d.connectionId, d);

    if (routeId.value === 'new') {
        await createVideoCall();
        router.replace({ params: { id: d.videoCall.id } });
    } else {
        // Join the existing call directly via WebSocket
        try {
            const result = await joinVideoCall(wsService, routeId.value, d.connectionId);
            d.videoCall = result.videoCall;

            // Log active connections
            d.events.push({
                type: 'system',
                data: { message: `Joined call with ${result.activeConnections?.length || 0} active connections` },
                time: new Date()
            });
        } catch (error) {
            console.error("Error joining video call:", error);

            // Try fallback to server method if WebSocket join fails
            let result = await serverMethods.videoCall.create([d.connectionId]);
            if (await checkAndShowHttpError(result)) return;
            d.videoCall = result.data.videoCall;
        }
    }

    d.loading = false;

    // Initialize signaling service
    if (wsService && d.videoCall) {
        signaling = new VideoCallSignaling(wsService, d);

        // Initialize WebRTC
        try {
            // Join the call
            await sendMessage('join', { connectionId: d.connectionId });

            // Initialize WebRTC and signaling
            rtcService = await signaling.initialize(d.connectionId);

            // Set remote stream handler
            if (rtcService) {
                rtcService.setOnRemoteStreamAdded(handleRemoteStreamAdded);
                // Set connection status change handler
                rtcService.setOnConnectionStatusChanged(handleConnectionStatusChanged);
            }

            // Save local stream reference
            localStream = rtcService.getLocalMediaStream();

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
                        !remoteStreams.some(s => s.id === conn.connectionId)) {
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
    if (signaling) {
        signaling.cleanup();
        signaling = null;
    }

    // Clean up WebSocket connection
    if (wsService) {
        wsService.disconnect();
        wsService = null;
    }

    // Stop screen sharing if active
    if (isScreenSharing.value && originalStream) {
        stopScreenSharing();
    }

    // Perform cleanup on rtcService
    if (rtcService) {
        rtcService.closeAllConnections();
        rtcService = null;
    }

    // Stop all streams
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (originalStream) {
        originalStream.getTracks().forEach(track => track.stop());
        originalStream = null;
    }

    // Clear remote streams array
    remoteStreams = [];
})

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

        // Save original stream for later
        originalStream = localStream;

        // Get screen share stream
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true
        });

        // Update local stream reference
        localStream = screenStream;

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

        isScreenSharing.value = true;

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
        if (!rtcService || !originalStream || !localStream) return;

        // Stop all tracks in screen sharing stream
        localStream.getTracks().forEach(track => track.stop());

        // Restore original stream
        localStream = originalStream;
        originalStream = null;

        // Replace tracks in all peer connections
        const videoTrack = localStream.getVideoTracks()[0];
        const connections = rtcService.getConnections();

        for (const conn of connections) {
            const senders = conn.connection.getSenders();
            const sender = senders.find(s => s.track && s.track.kind === 'video');
            if (sender) {
                await sender.replaceTrack(videoTrack);
            }
        }

        isScreenSharing.value = false;
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

// Helper function to count total active participants
function getTotalActiveParticipants() {
    // Count:
    // 1. The local participant (always 1)
    // 2. Remote streams in the sidebar
    // 3. Selected remote stream (if any)
    return 1 + remoteStreams.length + (selectedRemoteStream.value ? 1 : 0);
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
</style>