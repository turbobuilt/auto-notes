<script setup lang="ts">
import { checkAndShowHttpError } from "@/lib/checkAndShowHttpError";
import { db } from "@/lib/db";
import { serverMethods } from "@/serverMethods";
import { createApp, ref, computed, onMounted, watch, onBeforeUnmount } from "vue";
import AudioVisualizer from "@/components/AudioVisualizer.vue";
import { recorderService } from "@/lib/recorderService";
declare const lamejs: any;


const apiKey = ref(localStorage.getItem('openai_api_key') || '');
const isRecording = ref(false);
const recordingTime = ref(0);
const sessions = ref([]);
const activeSession = ref(null);
const timerInterval = ref(null);
const loading = ref(false);
const loadingMessage = ref('');
const showTranscriptModal = ref(false);
const showDeleteConfirm = ref(false);
const showApiKeyForm = ref(false);
const showDebugInfo = ref(false);
const searchTerm = ref('');
const searchResults = ref([]);
const isSearching = ref(false);
const clientName = ref('');

// New variables for API key choice modal
const showPasswordForm = ref(false);
const passwordInput = ref('');
const passwordError = ref('');
const isSubmittingPassword = ref(false);

// Mobile-specific refs
const sidebarOpen = ref(false);

// Audio stream variable for passing to AudioVisualizer
const audioStream = ref(null);

// Add a ref to track any blob URLs we create so we can revoke them later
const activeBlobUrl = ref(null);

// Computed properties
const formattedTime = computed(() => {
  const hours = Math.floor(recordingTime.value / 3600);
  const minutes = Math.floor((recordingTime.value % 3600) / 60);
  const seconds = recordingTime.value % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
});

const formattedDate = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

const formattedDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Add a computed property for the recording URL
const recordingUrl = computed(() => {
  // If we have an active blob URL from before, use it
  if (activeBlobUrl.value) {
    return activeBlobUrl.value;
  }

  if (activeSession.value && activeSession.value.recording) {
    // Create a new blob URL if we have a blob
    if (activeSession.value.recording instanceof Blob) {
      // Revoke any existing URL to prevent memory leaks
      if (activeBlobUrl.value) {
        URL.revokeObjectURL(activeBlobUrl.value);
      }
      // Create and store the new URL
      activeBlobUrl.value = URL.createObjectURL(activeSession.value.recording);
      return activeBlobUrl.value;
    }
    // For backwards compatibility - if it's already a string URL
    else if (typeof activeSession.value.recording === 'string') {
      return activeSession.value.recording;
    }
  }
  return null;
});

// Add function to format file size
const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Toggle sidebar for mobile
const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value;
  document.body.style.overflow = sidebarOpen.value ? 'hidden' : '';
};

// Close sidebar when clicking outside
const closeSidebar = (event) => {
  if (sidebarOpen.value) {
    sidebarOpen.value = false;
    document.body.style.overflow = '';
  }
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

// Modified loadSessions to log any errors
const loadSessions = async () => {
  try {
    sessions.value = await db.sessions.orderBy('date').reverse().toArray();
    console.log("Loaded sessions:", sessions.value);
  } catch (err) {
    console.error("Error loading sessions:", err);
  }
};

const selectSession = async (session) => {
  console.log("Selecting session:", session);

  // Clean up previous blob URL if exists
  if (activeBlobUrl.value) {
    URL.revokeObjectURL(activeBlobUrl.value);
    activeBlobUrl.value = null;
  }

  activeSession.value = session;
  clientName.value = session.clientName || '';

  // Close sidebar on mobile after selection
  if (window.innerWidth <= 768) {
    sidebarOpen.value = false;
    document.body.style.overflow = '';
  }

  // Always load recordings, transcripts, and summaries regardless of status
  try {
    console.log("Looking for recording with sessionId:", session.id);
    const recording = await db.recordings.where('sessionId').equals(session.id).first();
    console.log("Found recording:", recording);

    console.log("Looking for transcript with sessionId:", session.id);
    const transcript = await db.transcripts.where('sessionId').equals(session.id).first();
    console.log("Found transcript:", transcript);

    console.log("Looking for summary with sessionId:", session.id);
    const summary = await db.summaries.where('sessionId').equals(session.id).first();
    console.log("Found summary:", summary);

    if (recording) {
      // Handle different recording storage formats for backward compatibility
      if (recording.arrayBuffer) {
        // New format: stored as ArrayBuffer
        const mimeType = recording.mimeType || 'audio/webm';
        session.recording = arrayBufferToBlob(recording.arrayBuffer, mimeType);
        session.fileSize = recording.arrayBuffer.byteLength;
      } else if (recording.blob instanceof Blob) {
        // Direct Blob storage (may work in some browsers)
        session.recording = recording.blob;
        session.fileSize = recording.blob.size;
      } else if (typeof recording.blob === 'string' && recording.blob.startsWith('data:')) {
        // Handle data URLs if that was used as a fallback previously
        const response = await fetch(recording.blob);
        session.recording = await response.blob();
        session.fileSize = session.recording.size;
      }
    }

    if (transcript) session.transcript = transcript.text;
    if (summary) session.summary = summary.text;

    console.log("Updated session object:", session);
  } catch (err) {
    console.error("Error loading session data:", err);
  }
};

const startRecording = async () => {
  try {
    await recorderService.startRecording({
      onTimeUpdate: (seconds) => {
        recordingTime.value = seconds;
      },
      onRecordingComplete: async (audioBlob, duration) => {
        await finishRecordingAndProcess(audioBlob, duration);
      }
    });
    
    isRecording.value = true;
    audioStream.value = recorderService.getAudioStream();
    
  } catch (err) {
    console.error("Recording error:", err);
    alert('Error accessing microphone: ' + err.message);
  }
};

const stopRecording = () => {
  if (isRecording.value) {
    recorderService.stopRecording();
    isRecording.value = false;
    audioStream.value = null;
  }
};

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

    await loadSessions();
    const newSession = sessions.value.find(s => s.id === sessionId);
    if (newSession) {
      newSession.recording = audioBlob; // Keep the blob in memory for this session
      newSession.fileSize = audioBlob.size;
      selectSession(newSession);
      await processRecording(newSession, audioBlob);
    }
  } catch (err) {
    console.error("Error finishing recording:", err);
    alert("Error saving recording: " + err.message);
  }
};

const processRecording = async (session, audioBlob) => {
  try {
    loading.value = true;

    // Update session status
    await db.sessions.update(session.id, { status: 'processing' });
    session.status = 'processing';

    // Transcribe audio
    loadingMessage.value = 'Transcribing audio...';
    const { transcript, notes } = await getSummary(audioBlob);
    const summary = notes;

    // Store transcript
    await db.transcripts.add({
      sessionId: session.id,
      text: transcript
    });

    session.transcript = transcript;

    // Store summary
    await db.summaries.add({
      sessionId: session.id,
      text: summary
    });

    session.summary = summary;

    // Update session status
    await db.sessions.update(session.id, { status: 'completed' });
    session.status = 'completed';

  } catch (err) {
    console.error('Error processing recording:', err);
    alert('Error processing recording: ' + err.message);
    await db.sessions.update(session.id, { status: 'error' });
    session.status = 'error';
  } finally {
    loading.value = false;
  }
};

const getSummary = async (audioBlob) => {
  // post audioBlob to server
  let result = await serverMethods.session.summarize(audioBlob);
  if (await checkAndShowHttpError(result))
    throw new Error("error transcribing");
  return result.data;
};


const saveApiKey = () => {
  localStorage.setItem('openai_api_key', apiKey.value);
  showApiKeyForm.value = false;
};

const deleteSession = async () => {
  if (activeSession.value) {
    await db.recordings.delete(activeSession.value.id);
    await db.transcripts.delete(activeSession.value.id);
    await db.summaries.delete(activeSession.value.id);
    await db.sessions.delete(activeSession.value.id);
    showDeleteConfirm.value = false;
    activeSession.value = null;
    await loadSessions();
  }
};

const copyNotes = () => {
  if (activeSession.value && activeSession.value.summary) {
    navigator.clipboard.writeText(activeSession.value.summary)
      .then(() => alert('Notes copied to clipboard'))
      .catch(err => alert('Error copying text: ' + err));
  }
};

const toggleDebug = () => {
  showDebugInfo.value = !showDebugInfo.value;
};

// New method to update client name
const updateClientName = async () => {
  if (activeSession.value) {
    await db.sessions.update(activeSession.value.id, { clientName: clientName.value });
    activeSession.value.clientName = clientName.value;

    // Update the client name in the sessions list
    const sessionIndex = sessions.value.findIndex(s => s.id === activeSession.value.id);
    if (sessionIndex !== -1) {
      sessions.value[sessionIndex].clientName = clientName.value;
    }
  }
};

// Search functionality
const searchSessions = async () => {
  if (!searchTerm.value.trim()) {
    searchResults.value = [];
    isSearching.value = false;
    return;
  }

  isSearching.value = true;
  searchResults.value = [];

  const term = searchTerm.value.toLowerCase();

  // Load all sessions with their transcripts and summaries
  const allSessions = await db.sessions.toArray();

  for (const session of allSessions) {
    // Get transcript and summary for this session
    const transcript = await db.transcripts.where('sessionId').equals(session.id).first();
    const summary = await db.summaries.where('sessionId').equals(session.id).first();

    let matches = [];

    // Search in transcript
    if (transcript && transcript.text) {
      const transcriptText = transcript.text.toLowerCase();
      let index = transcriptText.indexOf(term);

      if (index !== -1) {
        // Get context for the match (50 chars before and after)
        const start = Math.max(0, index - 50);
        const end = Math.min(transcriptText.length, index + term.length + 50);
        const snippet = transcript.text.substring(start, end);

        // Create highlighted snippet
        const highlightedSnippet = highlightTerm(snippet, term);

        matches.push({
          source: 'transcript',
          text: highlightedSnippet
        });
      }
    }

    // Search in summary
    if (summary && summary.text) {
      const summaryText = summary.text.toLowerCase();
      let index = summaryText.indexOf(term);

      if (index !== -1) {
        // Get context for the match (50 chars before and after)
        const start = Math.max(0, index - 50);
        const end = Math.min(summaryText.length, index + term.length + 50);
        const snippet = summary.text.substring(start, end);

        // Create highlighted snippet
        const highlightedSnippet = highlightTerm(snippet, term);

        matches.push({
          source: 'summary',
          text: highlightedSnippet
        });
      }
    }

    // If we found matches, add this session to results
    if (matches.length > 0) {
      searchResults.value.push({
        session: session,
        matches: matches
      });
    }
  }

  isSearching.value = false;
};

// Utility function to highlight search term in text
const highlightTerm = (text, term) => {
  const regex = new RegExp(`(${term})`, 'gi');
  return text.replace(regex, '<span class="search-highlight">$1</span>');
};

// Handle clicking a search result
const selectSearchResult = (sessionId) => {
  const session = sessions.value.find(s => s.id === sessionId);
  if (session) {
    selectSession(session);
    searchTerm.value = '';
    searchResults.value = [];
  }
};

// Check if device is mobile
const isMobile = () => window.innerWidth <= 768;

// Add retry processing function
const retryProcessing = async () => {
  if (!activeSession.value || !activeSession.value.recording) {
    alert('No recording available to process');
    return;
  }

  try {
    loading.value = true;
    loadingMessage.value = 'Reprocessing recording...';

    // Update session status
    await db.sessions.update(activeSession.value.id, { status: 'processing' });
    activeSession.value.status = 'processing';

    // Process the recording again
    await processRecording(activeSession.value, activeSession.value.recording);

  } catch (err) {
    console.error('Error retrying processing:', err);
    alert('Error retrying processing: ' + err.message);
    await db.sessions.update(activeSession.value.id, { status: 'error' });
    activeSession.value.status = 'error';
  } finally {
    loading.value = false;
  }
};

// Clean up blob URLs when the component is unmounted
const cleanupBlobUrls = () => {
  if (activeBlobUrl.value) {
    URL.revokeObjectURL(activeBlobUrl.value);
    activeBlobUrl.value = null;
  }
};

// Add diagnostic function to help troubleshoot database issues
const diagnoseDatabase = async () => {
  try {
    console.log("Checking database...");

    // Check sessions table
    const allSessions = await db.sessions.toArray();
    console.log(`Found ${allSessions.length} sessions`);

    // Check recordings table
    const allRecordings = await db.recordings.toArray();
    console.log(`Found ${allRecordings.length} recordings`);
    console.log("Recording storage formats:");
    allRecordings.forEach((rec, i) => {
      console.log(`  #${i}: sessionId=${rec.sessionId}, ` +
        `has blob=${!!rec.blob}, ` +
        `has arrayBuffer=${!!rec.arrayBuffer}, ` +
        `mimeType=${rec.mimeType || 'unknown'}`);
    });

    // Check transcripts and summaries
    const allTranscripts = await db.transcripts.toArray();
    const allSummaries = await db.summaries.toArray();
    console.log(`Found ${allTranscripts.length} transcripts and ${allSummaries.length} summaries`);

    return "Database check complete";
  } catch (err) {
    console.error("Database diagnostic error:", err);
    return `Database error: ${err.message}`;
  }
};

// Lifecycle hooks
onMounted(async () => {
  await loadSessions();
  if (sessions.value.length > 0) {
    selectSession(sessions.value[0]);
  }

  // Run database diagnostics on load
  diagnoseDatabase().then(message => console.log(message));

  // Log database contents on load for debugging
  console.log("All recordings:", await db.recordings.toArray());
  console.log("All transcripts:", await db.transcripts.toArray());
  console.log("All summaries:", await db.summaries.toArray());

  // Add event listener for window resize
  window.addEventListener('resize', () => {
    if (!isMobile() && sidebarOpen.value) {
      sidebarOpen.value = false;
      document.body.style.overflow = '';
    }
  });
});

// Add onBeforeUnmount to clean up resources
onBeforeUnmount(() => {
  cleanupBlobUrls();
});

// Watch for changes to search term
watch(searchTerm, (newValue, oldValue) => {
  if (newValue !== oldValue) {
    searchSessions();
  }
});

</script>
<template>
  <div class="dashboard-page">
    <div class="app-container">
      <div v-if="loading" class="loading-overlay">
        <div class="spinner-border mb-3" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <div>{{ loadingMessage }}</div>
      </div>

      <div v-if="showTranscriptModal && activeSession && activeSession.transcript" class="modal-background"
        @click="showTranscriptModal = false">
        <div class="modal-content" @click.stop>
          <h3>Transcript</h3>
          <div class="mb-3">{{ activeSession.transcript }}</div>
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

      <div class="sidebar-overlay" :class="{ active: sidebarOpen }" @click="closeSidebar"></div>

      <div class="sidebar" :class="{ open: sidebarOpen }">
        <div class="mb-4 p-2">
          <h1 class="h4 mb-3">Therapy Notes</h1>
          <button class="btn btn-primary w-100" @click="isRecording ? stopRecording() : startRecording()"
            :disabled="loading">
            {{ isRecording ? 'Stop Recording' : 'Start Session' }}
          </button>
        </div>

        <!-- New search bar -->
        <div class="mb-3 p-2">
          <input type="text" class="form-control" placeholder="Search notes..." v-model="searchTerm">
        </div>

        <!-- Search results -->
        <div v-if="searchTerm && searchResults.length > 0" class="mb-3">
          <div v-for="result in searchResults" :key="result.session.id" class="search-result">
            <div class="search-result-title" @click="selectSearchResult(result.session.id)">
              {{ formattedDate(result.session.date) }}
              <span v-if="result.session.clientName" class="client-name">
                - {{ result.session.clientName }}
              </span>
            </div>
            <div v-for="(match, index) in result.matches" :key="index" @click="selectSearchResult(result.session.id)">
              <small v-html="match.text"></small>
              <small class="text-muted d-block">From {{ match.source }}</small>
            </div>
          </div>
        </div>

        <!-- No results message -->
        <div v-else-if="searchTerm && isSearching" class="no-results">
          <div class="spinner-border spinner-border-sm" role="status">
            <span class="visually-hidden">Searching...</span>
          </div>
          <div>Searching...</div>
        </div>

        <div v-else-if="searchTerm && !isSearching" class="no-results">
          No results found for "{{ searchTerm }}"
        </div>

        <!-- Session list (show only when not searching) -->
        <div v-if="!searchTerm">
          <div v-if="sessions.length === 0" class="text-center text-muted p-3">
            No sessions yet. Start recording a session.
          </div>

          <div v-for="session in sessions" :key="session.id" class="session-item"
            :class="{ active: activeSession && activeSession.id === session.id }" @click="selectSession(session)">
            <div>{{ formattedDate(session.date) }}</div>
            <div v-if="session.clientName" class="client-name">{{ session.clientName }}</div>
            <div class="d-flex justify-content-between">
              <small>{{ formattedDuration(session.duration) }}</small>
              <small>
                <span v-if="session.status === 'recorded'" class="text-primary">Recorded</span>
                <span v-if="session.status === 'processing'" class="text-warning">Processing</span>
                <span v-if="session.status === 'completed'" class="text-success">Complete</span>
                <span v-if="session.status === 'error'" class="text-danger">Error</span>
              </small>
            </div>
          </div>
        </div>

        <div class="mt-4 text-center">
          <button class="btn btn-sm btn-outline-secondary" @click="toggleDebug">
            {{ showDebugInfo ? 'Hide Debug' : 'Show Debug' }}
          </button>
        </div>
      </div>

      <div class="main-content">
        <div class="mobile-header">
          <button class="menu-toggle" @click="toggleSidebar">
            <i class="bi bi-list"></i>
          </button>
          <h1 class="h4 mb-0">Therapy Notes</h1>
        </div>

        <div v-if="isRecording" class="text-center mb-4">
          <div class="mb-3">
            <input type="text" class="form-control" placeholder="Client Name (optional)" v-model="clientName">
          </div>
          <div class="timer">{{ formattedTime }}</div>
          <div class="recording-indicator">● Recording</div>
          <AudioVisualizer :audio-stream="audioStream" :is-recording="isRecording" />
        </div>

        <div v-if="!isRecording && activeSession" class="session-details">
          <h2>{{ formattedDate(activeSession.date) }}</h2>

          <!-- Client Name Input -->
          <div class="mb-3">
            <label class="form-label">Client Name</label>
            <div class="input-group">
              <input type="text" class="form-control" placeholder="Client Name" v-model="clientName">
              <button class="btn btn-outline-primary" @click="updateClientName">Update</button>
            </div>
          </div>

          <p>Duration: {{ formattedDuration(activeSession.duration) }}</p>

          <div v-if="activeSession.recording" class="mb-4">
            <h4>Recording</h4>
            <div class="d-flex align-items-center">
              <audio v-if="recordingUrl" controls :src="recordingUrl" class="me-3"></audio>
              <span class="badge bg-info">{{ formatFileSize(activeSession.fileSize) }}</span>
            </div>

            <!-- Add retry button when recording exists but processing failed -->
            <div
              v-if="activeSession.status === 'error' || (!activeSession.transcript && activeSession.status !== 'processing')"
              class="mt-2">
              <button class="btn btn-warning" @click="retryProcessing">
                <i class="bi bi-arrow-repeat me-1"></i> Retry Transcription & Processing
              </button>
              <small class="text-muted d-block mt-1">
                Click to attempt processing this recording again
              </small>
            </div>
          </div>

          <div class="mb-4">
            <button v-if="activeSession.transcript" class="btn btn-outline-secondary me-2"
              @click="showTranscriptModal = true">
              Show Transcript
            </button>
            <span v-else-if="activeSession.status === 'completed'" class="text-warning">
              Transcript should be available but couldn't be loaded
              <button class="btn btn-sm btn-warning ms-2" @click="retryProcessing">
                Retry
              </button>
            </span>
          </div>

          <div v-if="activeSession.summary" class="mb-4">
            <h4>Summary</h4>
            <div class="card">
              <div class="card-body">
                <p style="white-space: pre-line">{{ activeSession.summary }}</p>
                <button class="btn btn-outline-primary" @click="copyNotes">Copy Notes</button>
              </div>
            </div>
          </div>
          <div v-else-if="activeSession.status === 'completed'" class="mb-4 text-warning">
            Summary should be available but couldn't be loaded
            <button class="btn btn-sm btn-warning ms-2" @click="retryProcessing">
              Retry
            </button>
          </div>

          <div v-if="showDebugInfo" class="mt-4 p-3 border rounded bg-light">
            <h5>Debug Information</h5>
            <div>
              <p><strong>Session ID:</strong> {{ activeSession.id }}</p>
              <p><strong>Status:</strong> {{ activeSession.status }}</p>
              <p><strong>Has recording object:</strong> {{ activeSession.recording ? 'Yes' : 'No' }}</p>
              <p><strong>File size:</strong> {{ activeSession.fileSize ? formatFileSize(activeSession.fileSize) : 'N/A'
              }}</p>
              <p><strong>Has transcript text:</strong> {{ activeSession.transcript ? 'Yes' : 'No' }}</p>
              <p><strong>Has summary text:</strong> {{ activeSession.summary ? 'Yes' : 'No' }}</p>
            </div>
          </div>

          <div class="mt-5">
            <button class="btn btn-danger" @click="showDeleteConfirm = true">Delete Session</button>
          </div>
        </div>

        <div v-if="!isRecording && !activeSession" class="text-center mt-5 text-muted">
          <p>Select a session from the sidebar or start a new recording session.</p>
        </div>
      </div>

      <div class="mobile-footer">
        <button class="btn btn-primary w-100" @click="isRecording ? stopRecording() : startRecording()"
          :disabled="loading">
          {{ isRecording ? 'Stop Recording' : 'Start Session' }}
        </button>
      </div>
    </div>
  </div>
</template>
<style lang="scss">
@import '../../../scss/variables.module.scss';

.dashboard-page {

  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f8f9fa;
    overflow-x: hidden;
    /* Prevent horizontal scrolling */
  }

  .app-container {
    position: relative;
    min-height: 100vh;
  }

  .sidebar {
    width: 300px;
    background-color: #f0f2f5;
    overflow-y: auto;
    border-right: 1px solid #dee2e6;
    padding: 1rem;
    height: 100vh;
    position: fixed;
    left: -300px;
    /* Hidden by default */
    top: 0;
    z-index: 1030;
    transition: left 0.3s ease;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  }

  .sidebar.open {
    left: 0;
    /* Show sidebar when open */
  }

  .sidebar-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 1020;
    display: none;
  }

  .sidebar-overlay.active {
    display: block;
  }

  .main-content {
    flex: 1;
    padding: 1rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    transition: margin-left 0.3s ease;
    margin-left: 0;
  }

  .mobile-header {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    background-color: #f8f9fa;
    border-bottom: 1px solid #dee2e6;
    position: sticky;
    top: 0;
    z-index: 1000;
  }

  .menu-toggle {
    font-size: 1.5rem;
    cursor: pointer;
    margin-right: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #212529;
  }

  .session-item {
    padding: 0.75rem;
    border-bottom: 1px solid #dee2e6;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .session-item:hover {
    background-color: #e9ecef;
  }

  .session-item.active {
    background-color: #dee2e6;
  }

  .record-button {
    padding: 1rem;
    border-radius: 50%;
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    font-size: 1.5rem;
  }

  .recording-indicator {
    color: #dc3545;
    font-weight: bold;
    animation: pulse 1.5s infinite;
  }

  .timer {
    font-size: 2rem;
    font-family: monospace;
    text-align: center;
    margin: 1rem 0;
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

  .session-details {
    margin-top: 1rem;
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

  .api-key-form {
    width: 90%;
    max-width: 500px;
    margin: 2rem auto;
    padding: 1rem;
    background-color: white;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
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

  .search-highlight {
    background-color: #ffff00;
    font-weight: bold;
  }

  .search-result {
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background-color: #f8f9fa;
    border-left: 3px solid #0d6efd;
    font-size: 0.9rem;
  }

  .search-result-title {
    font-weight: bold;
    margin-bottom: 0.25rem;
  }

  .client-name {
    color: #0d6efd;
    font-weight: 600;
  }

  .no-results {
    text-align: center;
    padding: 1rem;
    color: #6c757d;
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

  /* Responsive audio player */
  audio {
    width: 100%;
    max-width: 300px;
  }

  /* Touch-friendly buttons */
  .btn {
    padding: 0.5rem 0.75rem;
    min-height: 44px;
    /* For touch targets */
  }

  /* Sticky footer for mobile */
  .mobile-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: white;
    border-top: 1px solid #dee2e6;
    padding: 0.75rem;
    display: none;
    z-index: 1000;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  }

  @media (max-width: 768px) {
    .mobile-footer {
      display: block;
    }

    .main-content {
      padding-bottom: 80px;
      /* Make room for the footer */
    }
  }
}
</style>