<script setup lang="ts">
import { checkAndShowHttpError } from "@/lib/checkAndShowHttpError";
import { db } from "@/lib/db";
import { serverMethods } from "@/serverMethods";
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import AudioVisualizer from "@/components/AudioVisualizer.vue";
import { recorderService } from "@/lib/recorderService";
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

// State variables
const loading = ref(false);
const loadingMessage = ref('');
const showTranscriptModal = ref(false);
const showDeleteConfirm = ref(false);
const showDebugInfo = ref(false);
const clientName = ref('');
const session = ref(null);
const notFound = ref(false);
const isProcessing = ref(false);

// Audio stream variable for passing to AudioVisualizer
const audioStream = ref(null);

// Track any blob URLs we create so we can revoke them later
const activeBlobUrl = ref(null);

// Computed properties
const formattedDate = computed(() => {
    if (!session.value) return '';
    const date = new Date(session.value.date);
    return date.toLocaleString();
});

const formattedDuration = computed(() => {
    if (!session.value) return '00:00:00';
    const seconds = session.value.duration;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
});

// Add a computed property for the recording URL
const recordingUrl = computed(() => {
    // If we have an active blob URL from before, use it
    if (activeBlobUrl.value) {
        return activeBlobUrl.value;
    }

    if (session.value && session.value.recording) {
        // Create a new blob URL if we have a blob
        if (session.value.recording instanceof Blob) {
            // Revoke any existing URL to prevent memory leaks
            if (activeBlobUrl.value) {
                URL.revokeObjectURL(activeBlobUrl.value);
            }
            // Create and store the new URL
            activeBlobUrl.value = URL.createObjectURL(session.value.recording);
            return activeBlobUrl.value;
        }
        // For backwards compatibility - if it's already a string URL
        else if (typeof session.value.recording === 'string') {
            return session.value.recording;
        }
    }
    return null;
});

// Format file size
const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Methods
// Convert a Blob to ArrayBuffer
const blobToArrayBuffer = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
    });
};

// Convert ArrayBuffer to Blob
const arrayBufferToBlob = (buffer, mimeType) => {
    return new Blob([buffer], { type: mimeType || 'audio/webm' });
};

// Load session by ID
const loadSession = async (id) => {
    try {
        loading.value = true;
        loadingMessage.value = 'Loading session...';

        // If ID is 'new', we're starting a new recording session
        if (id === 'new') {
            setUpNewSession();
            return;
        }

        // Parse ID to integer if it's a string
        const sessionId = typeof id === 'string' ? parseInt(id, 10) : id;

        // Load the session from database
        const foundSession = await db.sessions.get(sessionId);

        if (!foundSession) {
            notFound.value = true;
            loading.value = false;
            return;
        }

        session.value = foundSession;
        clientName.value = foundSession.clientName || '';

        // Load associated recording, transcript, and summary
        await loadSessionData(sessionId);

    } catch (err) {
        console.error("Error loading session:", err);
    } finally {
        loading.value = false;
    }
};

// Load recording, transcript, and summary for a session
const loadSessionData = async (sessionId) => {
    try {
        console.log("Looking for recording with sessionId:", sessionId);
        const recording = await db.recordings.where('sessionId').equals(sessionId).first();
        console.log("Found recording:", recording);

        console.log("Looking for transcript with sessionId:", sessionId);
        const transcript = await db.transcripts.where('sessionId').equals(sessionId).first();
        console.log("Found transcript:", transcript);

        console.log("Looking for summary with sessionId:", sessionId);
        const summary = await db.summaries.where('sessionId').equals(sessionId).first();
        console.log("Found summary:", summary);

        if (recording) {
            // Handle different recording storage formats for backward compatibility
            if (recording.arrayBuffer) {
                // New format: stored as ArrayBuffer
                const mimeType = recording.mimeType || 'audio/webm';
                session.value.recording = arrayBufferToBlob(recording.arrayBuffer, mimeType);
                session.value.fileSize = recording.arrayBuffer.byteLength;
            } else if (recording.blob instanceof Blob) {
                // Direct Blob storage (may work in some browsers)
                session.value.recording = recording.blob;
                session.value.fileSize = recording.blob.size;
            } else if (typeof recording.blob === 'string' && recording.blob.startsWith('data:')) {
                // Handle data URLs if that was used as a fallback previously
                const response = await fetch(recording.blob);
                session.value.recording = await response.blob();
                session.value.fileSize = session.value.recording.size;
            }
        }

        if (transcript) session.value.transcript = transcript.text;
        if (summary) session.value.summary = summary.text;

        console.log("Updated session object:", session.value);
    } catch (err) {
        console.error("Error loading session data:", err);
    }
};

// New Session setup
const setUpNewSession = () => {
    session.value = {
        id: null,
        date: Date.now(),
        duration: 0,
        status: 'new',
        clientName: ''
    };
    startRecording();
};

// Start recording for a new session
const startRecording = async () => {
    try {
        await recorderService.startRecording({
            onTimeUpdate: (seconds) => {
                if (session.value) session.value.duration = seconds;
            },
            onRecordingComplete: async (audioBlob, duration) => {
                await finishRecordingAndProcess(audioBlob, duration);
            }
        });

        audioStream.value = recorderService.getAudioStream();

    } catch (err) {
        console.error("Recording error:", err);
        alert('Error accessing microphone: ' + err.message);
    }
};

// Stop current recording
const stopRecording = () => {
    recorderService.stopRecording();
    audioStream.value = null;
};

// Finish recording and process the audio
const finishRecordingAndProcess = async (audioBlob, duration) => {
    try {
        // Create new session
        const sessionId = await db.sessions.add({
            date: Date.now(),
            duration: duration,
            status: 'recorded',
            clientName: clientName.value || null
        });

        // Convert blob to ArrayBuffer for storage
        const arrayBuffer = await recorderService.blobToArrayBuffer(audioBlob);

        // Store recording with ArrayBuffer and original MIME type
        await db.recordings.add({
            sessionId,
            blob: null,  // No longer storing the blob directly
            arrayBuffer: arrayBuffer,
            mimeType: audioBlob.type
        });

        // Update the route to the new session ID
        router.replace(`/app//session/${sessionId}`);

        // Reload the session with new ID
        await loadSession(sessionId);

        // Process the recording
        if (session.value) {
            session.value.recording = audioBlob;
            session.value.fileSize = audioBlob.size;
            await processRecording(session.value, audioBlob);
        }
    } catch (err) {
        console.error("Error finishing recording:", err);
        alert("Error saving recording: " + err.message);
    }
};

// Process recording to get transcript and summary
const processRecording = async (currentSession, audioBlob) => {
    try {
        loading.value = true;
        isProcessing.value = true;

        // Update session status
        await db.sessions.update(currentSession.id, { status: 'processing' });
        currentSession.status = 'processing';

        // Transcribe audio
        loadingMessage.value = 'Transcribing audio...';
        const { transcript, notes } = await getSummary(audioBlob);
        const summary = notes;

        // Store transcript
        await db.transcripts.add({
            sessionId: currentSession.id,
            text: transcript
        });

        currentSession.transcript = transcript;

        // Store summary
        await db.summaries.add({
            sessionId: currentSession.id,
            text: summary
        });

        currentSession.summary = summary;

        // Update session status
        await db.sessions.update(currentSession.id, { status: 'completed' });
        currentSession.status = 'completed';

    } catch (err) {
        console.error('Error processing recording:', err);
        alert('Error processing recording: ' + err.message);
        await db.sessions.update(currentSession.id, { status: 'error' });
        currentSession.status = 'error';
    } finally {
        loading.value = false;
        isProcessing.value = false;
    }
};

// Get summary from the server
const getSummary = async (audioBlob) => {
    // post audioBlob to server
    let result = await serverMethods.session.summarize(audioBlob);
    if (await checkAndShowHttpError(result))
        throw new Error("error transcribing");
    return result.data;
};

// Update client name
const updateClientName = async () => {
    if (session.value) {
        await db.sessions.update(session.value.id, { clientName: clientName.value });
        session.value.clientName = clientName.value;
    }
};

// Delete session
const deleteSession = async () => {
    if (session.value) {
        try {
            await db.recordings.where('sessionId').equals(session.value.id).delete();
            await db.transcripts.where('sessionId').equals(session.value.id).delete();
            await db.summaries.where('sessionId').equals(session.value.id).delete();
            await db.sessions.delete(session.value.id);
            showDeleteConfirm.value = false;
            router.push('/app/');
        } catch (err) {
            console.error("Error deleting session:", err);
            alert("Error deleting session: " + err.message);
        }
    }
};

// Copy notes to clipboard
const copyNotes = () => {
    if (session.value && session.value.summary) {
        navigator.clipboard.writeText(session.value.summary)
            .then(() => alert('Notes copied to clipboard'))
            .catch(err => alert('Error copying text: ' + err));
    }
};

// Toggle debug info
const toggleDebug = () => {
    showDebugInfo.value = !showDebugInfo.value;
};

// Retry processing function
const retryProcessing = async () => {
    if (!session.value || !session.value.recording) {
        alert('No recording available to process');
        return;
    }

    try {
        loading.value = true;
        loadingMessage.value = 'Reprocessing recording...';

        // Update session status
        await db.sessions.update(session.value.id, { status: 'processing' });
        session.value.status = 'processing';

        // Process the recording again
        await processRecording(session.value, session.value.recording);

    } catch (err) {
        console.error('Error retrying processing:', err);
        alert('Error retrying processing: ' + err.message);
        await db.sessions.update(session.value.id, { status: 'error' });
        session.value.status = 'error';
    } finally {
        loading.value = false;
    }
};

// Go back to dashboard
const goBackToDashboard = () => {
    router.push('/app/');
};

// Clean up blob URLs when the component is unmounted
const cleanupBlobUrls = () => {
    if (activeBlobUrl.value) {
        URL.revokeObjectURL(activeBlobUrl.value);
        activeBlobUrl.value = null;
    }
};

// Lifecycle hooks
onMounted(async () => {
    const sessionId = (route.params as any).id;
    await loadSession(sessionId);
});

// Clean up resources when component is unmounted
onBeforeUnmount(() => {
    cleanupBlobUrls();
    if (audioStream.value) {
        stopRecording();
    }
});
</script>

<template>
    <div class="session-page">
        <div class="app-container">
            <div v-if="loading" class="loading-overlay">
                <div class="spinner-border mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <div>{{ loadingMessage }}</div>
            </div>

            <div v-if="showTranscriptModal && session && session.transcript" class="modal-background"
                @click="showTranscriptModal = false">
                <div class="modal-content" @click.stop>
                    <h3>Transcript</h3>
                    <div class="mb-3">{{ session.transcript }}</div>
                    <button class="btn btn-secondary" @click="showTranscriptModal = false">Close</button>
                </div>
            </div>

            <div v-if="showDeleteConfirm" class="modal-background">
                <div class="modal-content">
                    <h3>Confirm Deletion</h3>
                    <p>Are you sure you want to delete this session? This action cannot be undone.</p>
                    <div class="d-flex justify-content-end gap-2">
                        <button class="btn btn-secondary" @click="showDeleteConfirm = false">Cancel</button>
                        <button class="btn btn-danger" @click="deleteSession">Delete</button>
                    </div>
                </div>
            </div>

            <div class="main-content">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <button class="btn btn-outline-secondary" @click="goBackToDashboard">
                        <i class="bi bi-arrow-left me-2"></i>Back to Dashboard
                    </button>
                    <h1 class="h3">Session Details</h1>
                </div>

                <div v-if="notFound" class="alert alert-danger">
                    Session not found. The session may have been deleted or the ID is invalid.
                    <button class="btn btn-primary mt-2" @click="goBackToDashboard">Return to Dashboard</button>
                </div>

                <div v-else-if="session && session.status === 'new'" class="recording-mode">
                    <div class="text-center mb-4">
                        <div class="mb-3">
                            <input type="text" class="form-control" placeholder="Client Name (optional)"
                                v-model="clientName">
                        </div>
                        <div class="timer">{{ formattedDuration }}</div>
                        <div class="recording-indicator">● Recording</div>
                        <AudioVisualizer :audio-stream="audioStream" :is-recording="true" />

                        <button class="btn btn-danger btn-lg mt-4" @click="stopRecording">
                            <i class="bi bi-stop-circle me-2"></i>Stop Recording
                        </button>
                    </div>
                </div>

                <div v-else-if="session" class="session-details">
                    <div class="card mb-4">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <span>{{ formattedDate }}</span>
                            <span class="badge" :class="{
                                'bg-success': session.status === 'completed',
                                'bg-warning': session.status === 'processing',
                                'bg-danger': session.status === 'error',
                                'bg-primary': session.status === 'recorded'
                            }">
                                {{ session.status }}
                            </span>
                        </div>

                        <div class="card-body">
                            <!-- Client Name Input -->
                            <div class="mb-3">
                                <label class="form-label">Client Name</label>
                                <div class="input-group">
                                    <input type="text" class="form-control" placeholder="Client Name"
                                        v-model="clientName">
                                    <button class="btn btn-outline-primary" @click="updateClientName">Update</button>
                                </div>
                            </div>

                            <p>Duration: {{ formattedDuration }}</p>

                            <div v-if="session.recording" class="mb-4">
                                <h4>Recording</h4>
                                <div class="d-flex align-items-center">
                                    <audio v-if="recordingUrl" controls :src="recordingUrl" class="me-3"></audio>
                                    <span class="badge bg-info">{{ formatFileSize(session.fileSize) }}</span>
                                </div>

                                <!-- Add retry button when recording exists but processing failed -->
                                <div v-if="session.status === 'error' || (!session.transcript && session.status !== 'processing')"
                                    class="mt-2">
                                    <button class="btn btn-warning" @click="retryProcessing" :disabled="isProcessing">
                                        <i class="bi bi-arrow-repeat me-1"></i> Retry Transcription & Processing
                                    </button>
                                    <small class="text-muted d-block mt-1">
                                        Click to attempt processing this recording again
                                    </small>
                                </div>
                            </div>

                            <div class="mb-4">
                                <button v-if="session.transcript" class="btn btn-outline-secondary"
                                    @click="showTranscriptModal = true">
                                    Show Transcript
                                </button>
                                <span v-else-if="session.status === 'completed'" class="text-warning">
                                    Transcript should be available but couldn't be loaded
                                    <button class="btn btn-sm btn-warning ms-2" @click="retryProcessing">
                                        Retry
                                    </button>
                                </span>
                            </div>

                            <div v-if="session.summary" class="mb-4">
                                <h4>Summary</h4>
                                <div class="card">
                                    <div class="card-body">
                                        <p style="white-space: pre-line">{{ session.summary }}</p>
                                        <button class="btn btn-outline-primary" @click="copyNotes">Copy Notes</button>
                                    </div>
                                </div>
                            </div>
                            <div v-else-if="session.status === 'completed'" class="mb-4 text-warning">
                                Summary should be available but couldn't be loaded
                                <button class="btn btn-sm btn-warning ms-2" @click="retryProcessing">
                                    Retry
                                </button>
                            </div>
                        </div>
                    </div>

                    <div v-if="showDebugInfo" class="mt-4 p-3 border rounded bg-light">
                        <h5>Debug Information</h5>
                        <div>
                            <p><strong>Session ID:</strong> {{ session.id }}</p>
                            <p><strong>Status:</strong> {{ session.status }}</p>
                            <p><strong>Has recording object:</strong> {{ session.recording ? 'Yes' : 'No' }}</p>
                            <p><strong>File size:</strong> {{ session.fileSize ? formatFileSize(session.fileSize) :
                                'N/A' }}</p>
                            <p><strong>Has transcript text:</strong> {{ session.transcript ? 'Yes' : 'No' }}</p>
                            <p><strong>Has summary text:</strong> {{ session.summary ? 'Yes' : 'No' }}</p>
                        </div>
                    </div>

                    <div class="d-flex justify-content-between align-items-center mt-4">
                        <button class="btn btn-danger" @click="showDeleteConfirm = true">Delete Session</button>
                        <button class="btn btn-outline-secondary" @click="toggleDebug">
                            {{ showDebugInfo ? 'Hide Debug' : 'Show Debug' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="scss">
@import '../../../scss/variables.module.scss';

.session-page {
    .app-container {
        position: relative;
        min-height: 100vh;
        padding: 1rem;
    }

    .main-content {
        max-width: 800px;
        margin: 0 auto;
        padding: 1rem;
    }

    .loading-overlay {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        background-color: rgba(255, 255, 255, 0.9);
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 2000;
    }

    .modal-background {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1050;
    }

    .modal-content {
        background-color: white;
        border-radius: 5px;
        padding: 1rem;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
    }

    .recording-mode {
        margin: 2rem 0;
    }

    .timer {
        font-size: 2rem;
        font-family: monospace;
        text-align: center;
        margin: 1rem 0;
    }

    .recording-indicator {
        color: #dc3545;
        font-weight: bold;
        animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
        0% {
            opacity: 1;
        }

        50% {
            opacity: 0.5;
        }

        100% {
            opacity: 1;
        }
    }

    /* Responsive audio player */
    audio {
        width: 100%;
        max-width: 300px;
    }

    /* Mobile optimizations */
    @media (max-width: 768px) {
        .modal-content {
            width: 95%;
            max-height: 90vh;
        }

        .timer {
            font-size: 1.5rem;
        }

        .audio-visualizer {
            height: 60px;
        }

        h2 {
            font-size: 1.5rem;
        }

        h4 {
            font-size: 1.2rem;
        }
    }
}
</style>
