<script setup lang="ts">
import { checkAndShowHttpError } from "@/lib/checkAndShowHttpError";
import { db } from "@/lib/db";
import { serverMethods } from "@/serverMethods";
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import AudioVisualizer from "@/components/AudioVisualizer.vue";
import { recorderService } from "@/lib/recorderService";
import { useRoute, useRouter } from 'vue-router';
// Import the transcription utilities
import { transcribeAudio } from '@/new_lib/index';
// Import the summarization utility
import { summarizeTranscript } from '@/llm/summarizeTranscript';

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
// New variables for transcription state
const isTranscribing = ref(false);
const transcriptionProgress = ref(0);
const currentTranscriptionText = ref('');
const transcriptionChunks = ref([]);

// New variables for model loading and summarization
const isModelLoading = ref(false);
const modelLoadingProgress = ref(0);
const isSummarizing = ref(false);
const currentSummaryText = ref('');
const summaryChunks = ref([]);
const showSummaryModal = ref(false);

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
        router.replace(`/app/session/${sessionId}`);

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
        isTranscribing.value = true;
        transcriptionProgress.value = 0;
        currentTranscriptionText.value = '';
        transcriptionChunks.value = [];

        // Update session status
        await db.sessions.update(currentSession.id, { status: 'processing' });
        currentSession.status = 'processing';

        // Transcribe audio locally
        loadingMessage.value = 'Transcribing audio locally...';
        
        // Convert blob to ArrayBuffer for transcription
        const audioArrayBuffer = await blobToArrayBuffer(audioBlob);
        
        // Start the transcription process
        const transcription = await transcribeAudio(audioArrayBuffer, {
            onProgress: (progress) => {
                transcriptionProgress.value = progress.progress;
                loadingMessage.value = `Loading transcription model: ${Math.round(progress.progress)}%`;
            }
        });
        
        // Process transcription results as they come
        let finalTranscript = '';
        loadingMessage.value = 'Transcribing audio...';
        
        for await (const result of transcription) {
            currentTranscriptionText.value = result.text;
            transcriptionChunks.value = result.chunks;
            
            if (result.isComplete) {
                finalTranscript = result.text;
            }
        }
        console.log('Final transcript:', finalTranscript);
        isTranscribing.value = false;
        
        // Store transcript in database
        await db.transcripts.add({
            sessionId: currentSession.id,
            text: finalTranscript
        });
        
        currentSession.transcript = finalTranscript;
        
        // Send transcript to local model for summarization
        loadingMessage.value = 'Generating summary...';
        const { notes } = await getSummaryFromTranscript(finalTranscript);
        const summary = notes;

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
        isTranscribing.value = false;
        isSummarizing.value = false;
        showSummaryModal.value = false;
    }
};

// Get summary from the transcript (instead of audio)
const getSummaryFromTranscript = async (transcript) => {
    try {
        isModelLoading.value = true;
        isSummarizing.value = true;
        modelLoadingProgress.value = 0;
        currentSummaryText.value = '';
        summaryChunks.value = [];
        
        // Define progress callback for model loading
        const progress = {
            onLoadProgress: (progress) => {
                modelLoadingProgress.value = progress.progress;
                loadingMessage.value = `Loading summarization model: ${progress.text}`;
            }
        };
        
        // Start the summarization process
        const summarization = summarizeTranscript(transcript, progress);
        
        // Process summary results as they come
        let finalSummary = '';
        loadingMessage.value = 'Generating summary...';
        
        // Once model is loaded, show the summary modal
        showSummaryModal.value = true;
        
        for await (const chunk of summarization) {
            // when u get first chunk, not loading
            loading.value = false;

            // Accumulate the summary text
            currentSummaryText.value += chunk;
            
            // Add to chunks array for potential future use
            summaryChunks.value.push(chunk);
        }
        
        finalSummary = currentSummaryText.value;
        console.log('Final summary:', finalSummary);
        
        isModelLoading.value = false;
        isSummarizing.value = false;
        
        return { notes: finalSummary };
    } catch (err) {
        console.error('Error generating summary:', err);
        isModelLoading.value = false;
        isSummarizing.value = false;
        showSummaryModal.value = false;
        throw err;
    }
};

// The original getSummary is now only used as fallback
const getSummary = async (audioBlob) => {
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
                <div class="spinner"></div>
                <div class="loading-message-container">{{ loadingMessage }}</div>
                
                <!-- Transcription progress display -->
                <div v-if="isTranscribing" class="transcription-progress mt-4">
                    <div v-if="transcriptionProgress < 1" class="progress mb-2" style="width: 80%;">
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
                
                <!-- Model loading progress display -->
                <div v-if="isModelLoading" class="model-loading-progress mt-4">
                    <div v-if="modelLoadingProgress < 1" class="progress mb-2" style="width: 80%;">
                        <div class="progress-bar bg-success" role="progressbar"
                            :style="{ width: `${modelLoadingProgress * 100}%` }"
                            :aria-valuenow="modelLoadingProgress * 100" 
                            aria-valuemin="0" aria-valuemax="100">
                            {{ Math.round(modelLoadingProgress * 100) }}%
                        </div>
                    </div>
                    <div class="model-info">
                        <p class="info-text">Loading AI model for note generation. This happens once and will be faster next time.</p>
                    </div>
                </div>
            </div>

            <!-- Summary generation modal -->
            <div v-if="showSummaryModal && isSummarizing" class="summary-modal-background">
                <div class="summary-modal-content">
                    <h3>Generating Session Notes</h3>
                    <div class="summary-generation-header">
                        <div class="spinner small-spinner"></div>
                        <span class="generation-status">AI is analyzing the session and generating notes...</span>
                    </div>
                    
                    <div class="live-summary-container">
                        <div class="live-summary-content" ref="summaryContent">
                            <p style="white-space: pre-line">{{ currentSummaryText }}</p>
                        </div>
                    </div>
                    
                    <div class="summary-modal-footer">
                        <p class="info-text">Please wait while the AI analyzes the transcript and generates detailed notes...</p>
                    </div>
                </div>
            </div>

            <div v-if="showTranscriptModal && session && session.transcript" class="modal-background"
                @click="showTranscriptModal = false">
                <div class="modal-content" @click.stop>
                    <h3>Transcript</h3>
                    <div class="mb-3">{{ session.transcript }}</div>
                    <button class="secondary-button" @click="showTranscriptModal = false">Close</button>
                </div>
            </div>

            <div v-if="showDeleteConfirm" class="modal-background">
                <div class="modal-content">
                    <h3>Confirm Deletion</h3>
                    <p>Are you sure you want to delete this session? This action cannot be undone.</p>
                    <div class="d-flex justify-content-end gap-2">
                        <button class="secondary-button" @click="showDeleteConfirm = false">Cancel</button>
                        <button class="danger-button" @click="deleteSession">Delete</button>
                    </div>
                </div>
            </div>

            <div class="main-content">
                <div class="header-row">
                    <button class="secondary-button" @click="goBackToDashboard">
                        <i class="bi bi-arrow-left me-2"></i>Back to Dashboard
                    </button>
                    <h1>Session Details</h1>
                </div>

                <div v-if="notFound" class="alert-card">
                    <p>Session not found. The session may have been deleted or the ID is invalid.</p>
                    <button class="primary-button" @click="goBackToDashboard">Return to Dashboard</button>
                </div>

                <div v-else-if="session && session.status === 'new'" class="recording-mode">
                    <div class="recording-card">
                        <div class="client-input">
                            <input type="text" class="form-input" placeholder="Client Name (optional)"
                                v-model="clientName">
                        </div>
                        <div class="timer">{{ formattedDuration }}</div>
                        <div class="recording-indicator">● Recording</div>
                        <AudioVisualizer :audio-stream="audioStream" :is-recording="true" />

                        <button class="danger-button btn-lg" @click="stopRecording">
                            <i class="bi bi-stop-circle me-2"></i>Stop Recording
                        </button>
                    </div>
                </div>

                <div v-else-if="session" class="session-details">
                    <div class="session-card">
                        <div class="session-card-header">
                            <span>{{ formattedDate }}</span>
                            <span class="status-badge" :class="{
                                'status-completed': session.status === 'completed',
                                'status-processing': session.status === 'processing',
                                'status-error': session.status === 'error',
                                'status-recorded': session.status === 'recorded'
                            }">
                                {{ session.status }}
                            </span>
                        </div>

                        <div class="session-card-body">
                            <!-- Client Name Input -->
                            <div class="input-section">
                                <label class="input-label">Client Name</label>
                                <div class="input-group">
                                    <input type="text" class="form-input" placeholder="Client Name"
                                        v-model="clientName">
                                    <button class="secondary-button" @click="updateClientName">Update</button>
                                </div>
                            </div>

                            <p class="duration-text">Duration: {{ formattedDuration }}</p>

                            <div v-if="session.recording" class="recording-section">
                                <h4>Recording</h4>
                                <div class="audio-player-container">
                                    <audio v-if="recordingUrl" controls :src="recordingUrl" class="audio-player"></audio>
                                    <span class="file-size-badge">{{ formatFileSize(session.fileSize) }}</span>
                                </div>

                                <!-- Add retry button when recording exists but processing failed -->
                                <div v-if="session.status === 'error' || (!session.transcript && session.status !== 'processing')"
                                    class="retry-section">
                                    <button class="warning-button" @click="retryProcessing" :disabled="isProcessing">
                                        <i class="bi bi-arrow-repeat me-1"></i> Retry Transcription & Processing
                                    </button>
                                    <small class="info-text">
                                        Click to attempt processing this recording again
                                    </small>
                                </div>
                            </div>
                            
                            <div class="transcript-section">
                                <button v-if="session.transcript" class="secondary-button"
                                    @click="showTranscriptModal = true">
                                    Show Transcript
                                </button>
                                <span v-else-if="session.status === 'completed'" class="warning-text">
                                    Transcript should be available but couldn't be loaded
                                    <button class="warning-button small" @click="retryProcessing">
                                        Retry
                                    </button>
                                </span>
                            </div>

                            <div v-if="session.summary" class="summary-section">
                                <h4>Summary</h4>
                                <div class="summary-card">
                                    <p style="white-space: pre-line">{{ session.summary }}</p>
                                    <button class="primary-button" @click="copyNotes">Copy Notes</button>
                                </div>
                            </div>
                            <div v-else-if="session.status === 'completed'" class="warning-text">
                                Summary should be available but couldn't be loaded
                                <button class="warning-button small" @click="retryProcessing">
                                    Retry
                                </button>
                            </div>
                        </div>
                    </div>

                    <div v-if="showDebugInfo" class="debug-panel">
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

                    <div class="action-row">
                        <button class="danger-button" @click="showDeleteConfirm = true">Delete Session</button>
                        <button class="secondary-button small" @click="toggleDebug">
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
    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: $text-dark;
    line-height: 1.6;

    .app-container {
        position: relative;
        min-height: 100vh;
        padding: $spacing-sm;
    }

    .main-content {
        max-width: 800px;
        margin: 0 auto;
        padding: $spacing-md;
    }

    .loading-message-container {
        font-size: 1.2rem;
        font-weight: 600;
        color: $text-dark;
        max-width: 100%;
        min-width: 0;
        padding: 15px;
    }
    
    h1 {
        font-size: clamp(1.5rem, 3vw, 2.5rem);
        font-weight: 700;
        margin: 0;
        background: $primary-gradient;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
    }
    
    h4 {
        font-size: 1.5rem;
        font-weight: 600;
        margin-top: $spacing-md;
        margin-bottom: $spacing-sm;
    }
    
    h5 {
        font-size: 1.2rem;
        font-weight: 600;
        margin: 0;
    }

    // Header row
    .header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: $spacing-lg;
    }

    // Button styles
    .primary-button {
        display: inline-flex;
        align-items: center;
        background: $primary-gradient;
        color: $white;
        padding: $spacing-xs $spacing-md;
        border-radius: $border-radius-md;
        border: none;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
        transition: transform 0.2s, box-shadow 0.2s;
        box-shadow: $shadow-sm;
        
        &:hover {
            transform: translateY(-2px);
            box-shadow: $shadow-md;
        }
        
        &.btn-lg {
            padding: $spacing-sm $spacing-lg;
            font-size: 1.1rem;
        }
    }
    
    .secondary-button {
        display: inline-flex;
        align-items: center;
        background: rgba($primary, 0.1);
        color: $primary;
        padding: $spacing-xs $spacing-md;
        border-radius: $border-radius-md;
        border: none;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        
        &:hover {
            background: rgba($primary, 0.2);
        }
        
        &.small {
            font-size: 0.9rem;
            padding: $spacing-xs $spacing-sm;
        }
    }

    .danger-button {
        display: inline-flex;
        align-items: center;
        background: linear-gradient(135deg, #ff4b2b, #ff416c);
        color: $white;
        padding: $spacing-xs $spacing-md;
        border-radius: $border-radius-md;
        border: none;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        
        &:hover {
            transform: translateY(-2px);
            box-shadow: $shadow-md;
        }
        
        &.btn-lg {
            padding: $spacing-sm $spacing-lg;
            font-size: 1.1rem;
        }
    }

    .warning-button {
        display: inline-flex;
        align-items: center;
        background: rgba(#f59e0b, 0.1);
        color: #f59e0b;
        padding: $spacing-xs $spacing-md;
        border-radius: $border-radius-md;
        border: none;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        
        &:hover {
            background: rgba(#f59e0b, 0.2);
        }
        
        &.small {
            font-size: 0.9rem;
            padding: $spacing-xs $spacing-sm;
            margin-left: $spacing-xs;
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }

    // Form elements
    .form-input {
        width: 100%;
        padding: $spacing-sm;
        border: 1px solid #ddd;
        border-radius: $border-radius-md;
        background: $white;
        outline: none;
        transition: all 0.2s;
        
        &:focus {
            border-color: $primary;
            box-shadow: 0 0 0 2px rgba($primary, 0.2);
        }
    }

    .input-section {
        margin-bottom: $spacing-md;
    }

    .input-label {
        display: block;
        margin-bottom: $spacing-xs;
        font-weight: 500;
    }

    .input-group {
        display: flex;
        gap: $spacing-xs;
        
        .form-input {
            flex: 1;
        }
    }

    // Loading overlay
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

    // Spinner
    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid rgba($primary, 0.3);
        border-radius: 50%;
        border-top-color: $primary;
        animation: spin 1s linear infinite;
        margin-bottom: $spacing-md;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    // Modal styles
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
        border-radius: $border-radius-lg;
        padding: $spacing-lg;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: $shadow-lg;
    }

    // Alert card
    .alert-card {
        background-color: rgba(#ef4444, 0.1);
        border-left: 4px solid #ef4444;
        padding: $spacing-md;
        border-radius: $border-radius-md;
        margin-bottom: $spacing-lg;
    }

    // Recording mode
    .recording-mode {
        margin: $spacing-xl 0;
    }

    .recording-card {
        background: $white;
        border-radius: $border-radius-lg;
        padding: $spacing-lg;
        box-shadow: $shadow-card;
        text-align: center;
        
        .client-input {
            margin-bottom: $spacing-md;
        }
    }

    .timer {
        font-size: 2.5rem;
        font-family: monospace;
        text-align: center;
        margin: $spacing-md 0;
        color: $primary;
    }

    .recording-indicator {
        color: #ef4444;
        font-weight: bold;
        animation: pulse 1.5s infinite;
        margin-bottom: $spacing-md;
        font-size: 1.2rem;
    }

    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }

    // Session details
    .session-card {
        background: $white;
        border-radius: $border-radius-lg;
        box-shadow: $shadow-card;
        margin-bottom: $spacing-lg;
        overflow: hidden;
    }

    .session-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: $spacing-md;
        background: rgba($primary, 0.05);
        border-bottom: 1px solid rgba($primary, 0.1);
    }

    .session-card-body {
        padding: $spacing-lg;
    }

    // Status badges
    .status-badge {
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0.25rem 0.5rem;
        border-radius: $border-radius-sm;
        text-transform: uppercase;
        
        &.status-completed {
            background-color: rgba(#10b981, 0.2);
            color: #10b981;
        }
        
        &.status-processing {
            background-color: rgba(#f59e0b, 0.2);
            color: #f59e0b;
        }
        
        &.status-error {
            background-color: rgba(#ef4444, 0.2);
            color: #ef4444;
        }
        
        &.status-recorded {
            background-color: rgba($primary, 0.2);
            color: $primary;
        }
    }

    .file-size-badge {
        display: inline-block;
        padding: $spacing-xs $spacing-sm;
        border-radius: $border-radius-sm;
        background: rgba($primary, 0.1);
        color: $primary;
        font-size: 0.8rem;
        font-weight: 600;
    }

    // Audio player
    .audio-player-container {
        display: flex;
        align-items: center;
        gap: $spacing-md;
        margin: $spacing-sm 0 $spacing-md;
    }

    .audio-player {
        width: 100%;
        max-width: 500px;
        height: 40px;
    }

    // Sections
    .recording-section, .transcript-section, .summary-section {
        margin-bottom: $spacing-lg;
    }

    .retry-section {
        margin-top: $spacing-sm;
    }

    .summary-card {
        background: $background-light;
        border-radius: $border-radius-md;
        padding: $spacing-md;
        border-left: 4px solid $primary;
        margin-bottom: $spacing-md;
    }

    // Text styles
    .duration-text {
        font-size: 1.1rem;
        color: $text-dark;
        margin-bottom: $spacing-md;
    }

    .warning-text {
        color: #f59e0b;
        font-weight: 500;
        display: flex;
        align-items: center;
    }

    .info-text {
        display: block;
        color: $text-muted;
        margin-top: $spacing-xs;
        font-size: 0.9rem;
    }

    // Debug panel
    .debug-panel {
        margin-top: $spacing-xl;
        padding: $spacing-md;
        border-radius: $border-radius-md;
        background: $background-light;
        box-shadow: $shadow-sm;
        
        h5 {
            margin-bottom: $spacing-sm;
        }
    }

    // Action row
    .action-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: $spacing-lg;
    }

    // Transcription progress
    .transcription-progress {
        width: 80%;
        max-width: 600px;
    }
    
    .progress {
        height: 10px;
        background-color: rgba($primary, 0.1);
        border-radius: $border-radius-sm;
        overflow: hidden;
    }
    
    .progress-bar {
        height: 100%;
        background: $primary-gradient;
    }
    
    .current-transcription {
        width: 100%;
        text-align: left;
    }
    
    .transcription-box {
        max-height: 300px;
        overflow-y: auto;
        padding: $spacing-md;
        background-color: $background-light;
        border-radius: $border-radius-md;
        border: 1px solid #dee2e6;
        margin-top: $spacing-sm;
        text-align: left;
        font-size: 0.9rem;
        line-height: 1.5;
    }

    // Model loading progress
    .model-loading-progress {
        width: 80%;
        max-width: 600px;
    }
    
    .model-info {
        margin-top: $spacing-sm;
        text-align: center;
        
        .info-text {
            color: $text-muted;
            font-size: 0.9rem;
        }
    }
    
    // Summary generation modal
    .summary-modal-background {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1100;
    }
    
    .summary-modal-content {
        background-color: white;
        border-radius: $border-radius-lg;
        padding: $spacing-lg;
        width: 90%;
        max-width: 800px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: $shadow-lg;
        
        h3 {
            font-size: 1.5rem;
            font-weight: 700;
            color: $primary;
            margin-bottom: $spacing-md;
            text-align: center;
        }
    }
    
    .summary-generation-header {
        display: flex;
        align-items: center;
        margin-bottom: $spacing-md;
        padding: $spacing-sm;
        background: rgba($primary, 0.1);
        border-radius: $border-radius-md;
        
        .generation-status {
            margin-left: $spacing-sm;
            font-weight: 500;
            color: $primary;
        }
    }
    
    .small-spinner {
        width: 24px;
        height: 24px;
        border-width: 3px;
    }
    
    .live-summary-container {
        flex: 1;
        overflow: hidden;
        position: relative;
        margin-bottom: $spacing-md;
        border: 1px solid #eaecef;
        border-radius: $border-radius-md;
        background: $background-light;
    }
    
    .live-summary-content {
        padding: $spacing-md;
        height: 400px;
        overflow-y: auto;
        font-size: 1rem;
        line-height: 1.6;
        color: $text-dark;
        font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
        
        p {
            margin-bottom: $spacing-md;
        }
    }
    
    .summary-modal-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        
        .info-text {
            color: $text-muted;
            font-size: 0.9rem;
        }
    }
    
    // Progress bar colors for model loading
    .progress-bar.bg-success {
        background: linear-gradient(135deg, #28a745, #20c997);
    }

    /* Responsive styles */
    @media (max-width: $breakpoint-md) {
        .main-content {
            padding: $spacing-sm;
        }
        
        .header-row {
            flex-direction: column;
            align-items: flex-start;
            gap: $spacing-md;
        }
        
        .timer {
            font-size: 2rem;
        }
        
        .audio-player-container {
            flex-direction: column;
            align-items: flex-start;
        }
        
        .action-row {
            flex-direction: column;
            gap: $spacing-md;
            
            button {
                width: 100%;
            }
        }
    }
}
</style>
