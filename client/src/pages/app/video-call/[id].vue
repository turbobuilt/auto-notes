<script lang="ts" setup>
import { checkAndShowHttpError } from '@/lib/checkAndShowHttpError';
import router from '@/router'
import { serverMethods } from '@/serverMethods';
import type { VideoCall } from '@/serverTypes/videoCall/VideoCall.model';
import { store } from '@/store';
import { onMounted, ref, reactive, computed, onUnmounted, watch } from 'vue'
import { initVideoCallWebSocket, joinVideoCall, sendVideoCallMessage } from '@/lib/videoCallWebSocket';
import { VideoCallSignaling } from '@/lib/videoCallSignaling';
import { WebRTCService } from '@/lib/webrtcService';
import VideoParticipant from '@/components/VideoParticipant.vue';
import { recorderService } from '@/lib/recorderService';
import { db } from "@/lib/db";
import { transcribeAudio } from '@/new_lib/index';
import { summarizeTranscript } from '@/llm/summarizeTranscript';

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

// Replace the current remote stream variables with these:
const allRemoteStreams = ref<Array<{ id: string, stream: MediaStream }>>([]);
const selectedStreamId = ref<string | null>(null);

// Computed properties to derive views
const selectedRemoteStream = computed(() => 
  allRemoteStreams.value.find(s => s.id === selectedStreamId.value) || null
);

const sidebarStreams = computed(() => 
  allRemoteStreams.value.filter(s => s.id !== selectedStreamId.value)
);

// Simplify getTotalActiveParticipants
function getTotalActiveParticipants() {
  return 1 + allRemoteStreams.value.length; // 1 local + all remote
}

// Simplified function to select a stream
function selectRemoteStream(streamData: { id: string, stream: MediaStream }) {
  selectedStreamId.value = streamData.id;
}

// Define the missing reactive variables
const showLocalVideoInCenter = computed(() => allRemoteStreams.value.length === 0 && !selectedRemoteStream.value);
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
    
    const existingIndex = allRemoteStreams.value.findIndex(s => s.id === connectionId);
    if (existingIndex >= 0) {
        allRemoteStreams.value[existingIndex] = { id: connectionId, stream };
    } else {
        allRemoteStreams.value.push({ id: connectionId, stream });
        if (selectedStreamId.value === null && allRemoteStreams.value.length === 1) {
            selectedStreamId.value = connectionId;
        }
    }
    
    d.hasRemoteConnections = allRemoteStreams.value.length > 0;
    d.events.push({
        type: 'stream',
        data: { connectionId, action: 'added' },
        time: new Date()
    });
}

function handleConnectionStatusChanged(connectionId: string, status: 'active' | 'stale' | 'dead') {
    console.log(`Connection status changed for ${connectionId}: ${status}`);
    
    connectionStatuses.set(connectionId, status);
    if (status === 'dead') {
        const index = allRemoteStreams.value.findIndex(s => s.id === connectionId);
        if (index !== -1) { // Add this check
            if (selectedStreamId.value === connectionId) {
                selectedStreamId.value = null;
            }
            allRemoteStreams.value.splice(index, 1);
            d.hasRemoteConnections = allRemoteStreams.value.length > 0;
        }
    }
    
    d.events.push({
        type: 'connection',
        data: { connectionId, status },
        time: new Date()
    });
}

// New variables for recording
const isRecording = ref(false);
const recordingTime = ref(0);
const showSavingModal = ref(false);
const showRecordingIndicator = ref(false);
const clientName = ref('');
const isTranscribing = ref(false);
const transcriptionProgress = ref(0);
const isSummarizing = ref(false);
const currentTranscriptionText = ref('');
const currentSummaryText = ref('');
const showTranscriptModal = ref(false);
const showSummaryModal = ref(false);

// Start recording the audio from the call
async function startRecording() {
  try {
    if (isRecording.value) return;
    
    console.log("Starting to record call audio...");
    
    // Create the audio mixer for combining streams
    const audioMixer = recorderService.createAudioMixer();
    
    // Add local stream if available
    if (localStream.value && localStream.value.getAudioTracks().length > 0) {
      recorderService.addStreamToRecording(localStream.value, 'local');
    }
    
    // Add all remote streams
    allRemoteStreams.value.forEach(streamData => {
      if (streamData.stream && streamData.stream.getAudioTracks().length > 0) {
        recorderService.addStreamToRecording(streamData.stream, streamData.id);
      }
    });
    
    // Check if we have any streams to record
    if (recorderService.getRecordingStreamCount() === 0) {
      alert("No audio streams available to record");
      return;
    }
    
    // Start recording with all the mixed streams
    await recorderService.startMultiStreamRecording({
      onTimeUpdate: (seconds) => {
        recordingTime.value = seconds;
      },
      onRecordingComplete: async (audioBlob, duration) => {
        await saveRecording(audioBlob, duration);
      }
    });
    
    isRecording.value = true;
    showRecordingIndicator.value = true;
    
    // Hide the indicator after 3 seconds
    setTimeout(() => {
      showRecordingIndicator.value = false;
    }, 3000);
    
  } catch (error) {
    console.error("Error starting recording:", error);
    alert(`Failed to start recording: ${error.message}`);
  }
}

// Stop the current recording
function stopRecording() {
  if (!isRecording.value) return;
  
  recorderService.stopRecording();
  isRecording.value = false;
  showSavingModal.value = true;
}

onMounted(() => {
    window.addEventListener('beforeunload', beforeUnload);
})
onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnload);
})
function beforeUnload(event: BeforeUnloadEvent) {
    serverMethods.videoCall.leave(d.videoCall?.id, d.connectionId);
}

// Save the recording to the database and process it
async function saveRecording(audioBlob: Blob, duration: number) {
  try {
    console.log("Saving recording, duration:", duration);
    
    // Create new session
    const sessionId = await db.sessions.add({
      date: Date.now(),
      duration: duration,
      status: 'recorded',
      clientName: clientName.value || `Video Call: ${d.videoCall.id}`,
      videoCallId: d.videoCall.id
    });

    // Convert blob to ArrayBuffer for storage
    const arrayBuffer = await recorderService.blobToArrayBuffer(audioBlob);

    // Store recording with ArrayBuffer and original MIME type
    await db.recordings.add({
      sessionId,
      blob: null,
      arrayBuffer: arrayBuffer,
      mimeType: audioBlob.type
    });
    
    showSavingModal.value = false;
    
    // Ask user if they want to process the recording now
    if (confirm("Recording saved. Process it now for transcript and summary?")) {
      await processRecording(sessionId, audioBlob);
    } else {
      alert(`Recording saved. You can process it later from the Dashboard.`);
    }
    
  } catch (error) {
    console.error("Error saving recording:", error);
    alert(`Error saving recording: ${error.message}`);
    showSavingModal.value = false;
  }
}

// Process the recording (similar to session page logic)
async function processRecording(sessionId: number, audioBlob: Blob) {
  try {
    showTranscriptModal.value = true;
    isTranscribing.value = true;
    transcriptionProgress.value = 0;
    currentTranscriptionText.value = '';
    
    // Update session status
    await db.sessions.update(sessionId, { status: 'processing' });
    
    // Convert blob to ArrayBuffer for transcription
    const audioArrayBuffer = await blobToArrayBuffer(audioBlob);
    
    // Start the transcription process
    const transcription = await transcribeAudio(audioArrayBuffer, {
      onProgress: (progress) => {
        transcriptionProgress.value = progress.progress;
      }
    });
    
    // Process transcription results as they come
    let finalTranscript = '';
    
    for await (const result of transcription) {
      currentTranscriptionText.value = result.text;
      if (result.isComplete) {
        finalTranscript = result.text;
      }
    }
    
    console.log('Final transcript:', finalTranscript);
    isTranscribing.value = false;
    
    // Store transcript in database
    await db.transcripts.add({
      sessionId: sessionId,
      text: finalTranscript
    });
    
    // Ask user if they want to generate a summary
    showTranscriptModal.value = false;
    const shouldSummarize = confirm("Transcription complete. Generate AI summary?");
    
    if (shouldSummarize) {
      // Send transcript to local model for summarization
      showSummaryModal.value = true;
      isSummarizing.value = true;
      currentSummaryText.value = '';
      
      const { notes } = await getSummaryFromTranscript(finalTranscript);
      const summary = notes;
      
      // Store summary
      await db.summaries.add({
        sessionId: sessionId,
        text: summary
      });
      
      // Update session status
      await db.sessions.update(sessionId, { status: 'completed' });
      
      isSummarizing.value = false;
      showSummaryModal.value = false;
      
      // Redirect to the session page to view the results
      router.push(`/app/session/${sessionId}`);
    } else {
      // Just mark as completed
      await db.sessions.update(sessionId, { status: 'completed' });
      alert(`Processing complete. You can view the results from the Dashboard.`);
    }
    
  } catch (error) {
    console.error("Error processing recording:", error);
    alert(`Error processing recording: ${error.message}`);
    
    await db.sessions.update(sessionId, { status: 'error' });
  } finally {
    isTranscribing.value = false;
    isSummarizing.value = false;
    showTranscriptModal.value = false;
    showSummaryModal.value = false;
  }
}

// Helper functions
const blobToArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
};

// Get summary from the transcript
const getSummaryFromTranscript = async (transcript: string) => {
  try {
    const summarization = summarizeTranscript(transcript, {
      onLoadProgress: (progress) => {
        console.log(`Loading summarization model: ${progress.text}`);
      }
    });
    
    // Process summary results as they come
    let finalSummary = '';
    
    for await (const chunk of summarization) {
      currentSummaryText.value += chunk;
    }
    
    finalSummary = currentSummaryText.value;
    return { notes: finalSummary };
    
  } catch (err) {
    console.error('Error generating summary:', err);
    throw err;
  }
};

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
                            !allRemoteStreams.value.some(s => s.id === conn.connectionId)) {
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

    // Add recording cleanup
    if (isRecording.value) {
        recorderService.stopRecording();
    }
    recorderService.cleanupMultiStreamRecording();
});

// Monitor audio streams to update recording
function updateRecordingStreams() {
  if (!isRecording.value) return;
  
  // Check for any new remote streams and add them to the recording
  allRemoteStreams.value.forEach(streamData => {
    recorderService.addStreamToRecording(streamData.stream, streamData.id);
  });
}

// Watch for changes in remote streams to update recording
watch(allRemoteStreams, () => {
  updateRecordingStreams();
}, { deep: true });

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
                            <button @click="isRecording ? stopRecording() : startRecording()"
                                :class="{ 'record-active': isRecording }">
                                {{ isRecording ? 'Stop Recording' : 'Record Call' }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Sidebar for additional videos - only show with more than 2 participants -->
                <div v-if="getTotalActiveParticipants() > 2" class="video-sidebar">
                    <!-- Map over remote streams array to display each one -->
                    <div v-for="streamData in sidebarStreams" :key="streamData.id" class="video-thumbnail">
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
                <p v-if="allRemoteStreams.length > 0" class="success-message">
                    {{ allRemoteStreams.length + (selectedRemoteStream ? 1 : 0) }} remote stream(s) connected
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

        <!-- Recording indicator -->
        <div v-if="showRecordingIndicator || isRecording" class="recording-indicator" :class="{ 'fade-out': !showRecordingIndicator && isRecording }">
            <div class="recording-dot"></div>
            <span>Recording {{ recordingTime }}s</span>
        </div>
        
        <!-- Saving modal -->
        <div v-if="showSavingModal" class="modal-background">
            <div class="modal-content">
                <h3>Saving Recording</h3>
                <div class="spinner"></div>
                <p>Please wait while we save your recording...</p>
            </div>
        </div>
        
        <!-- Transcription modal -->
        <div v-if="showTranscriptModal" class="modal-background">
            <div class="modal-content">
                <h3>Processing Recording</h3>
                
                <div v-if="isTranscribing" class="processing-info">
                    <div class="spinner"></div>
                    <p>Transcribing audio...</p>
                    
                    <div v-if="transcriptionProgress < 1" class="progress mb-2" style="width: 100%;">
                        <div class="progress-bar" role="progressbar"
                            :style="{ width: `${transcriptionProgress * 100}%` }"
                            :aria-valuenow="transcriptionProgress * 100" 
                            aria-valuemin="0" aria-valuemax="100">
                            {{ Math.round(transcriptionProgress * 100) }}%
                        </div>
                    </div>
                    
                    <div v-if="currentTranscriptionText" class="current-transcription mt-3">
                        <h5>Live Transcription:</h5>
                        <div class="transcription-box">
                            <p style="white-space: pre-line">{{ currentTranscriptionText }}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Summary modal -->
        <div v-if="showSummaryModal" class="modal-background">
            <div class="modal-content">
                <h3>Generating Summary</h3>
                
                <div v-if="isSummarizing" class="processing-info">
                    <div class="spinner"></div>
                    <p>Creating AI summary from transcript...</p>
                    
                    <div v-if="currentSummaryText" class="current-summary mt-3">
                        <h5>Summary:</h5>
                        <div class="summary-box">
                            <p style="white-space: pre-line">{{ currentSummaryText }}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Client name input for recording -->
        <div v-if="isRecording" class="client-name-input">
            <input
                type="text"
                v-model="clientName"
                placeholder="Enter client name for this recording"
                @blur="updateClientName"
            />
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

/* Recording controls and indicators */
.record-active {
  background-color: #ff4b4b !important;
  box-shadow: 0 0 8px rgba(255, 75, 75, 0.8);
  animation: pulse-record 2s infinite;
}

@keyframes pulse-record {
  0% { box-shadow: 0 0 0 0 rgba(255, 75, 75, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(255, 75, 75, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 75, 75, 0); }
}

.recording-indicator {
  position: fixed;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1100;
  transition: opacity 0.5s ease;
}

.fade-out {
  opacity: 0.6;
}

.recording-dot {
  width: 12px;
  height: 12px;
  background-color: #ff4b4b;
  border-radius: 50%;
  animation: blink 1s infinite;
}

@keyframes blink {
  0% { opacity: 0.4; }
  50% { opacity: 1; }
  100% { opacity: 0.4; }
}

.client-name-input {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  width: 90%;
  max-width: 400px;
}

.client-name-input input {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #ccc;
  background: rgba(255, 255, 255, 0.9);
}

/* Modal styles */
.modal-background {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background-color: white;
  border-radius: 8px;
  padding: 20px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.processing-info {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top-color: #0066cc;
  animation: spin 1s linear infinite;
  margin: 20px;
}

.transcription-box, .summary-box {
  max-height: 300px;
  overflow-y: auto;
  padding: 10px;
  background-color: #f5f5f5;
  border-radius: 4px;
  border: 1px solid #ddd;
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.5;
}

/* Progress bar */
.progress {
  height: 10px;
  background-color: #eee;
  border-radius: 5px;
  overflow: hidden;
  margin: 10px 0;
}

.progress-bar {
  height: 100%;
  background-color: #0066cc;
  transition: width 0.3s ease;
}
</style>