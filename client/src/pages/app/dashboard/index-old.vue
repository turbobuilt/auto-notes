<script setup lang="ts">
import { db } from "@/lib/db";
import { ref, computed, onMounted } from "vue";
import { useRouter } from 'vue-router';

const router = useRouter();
const sessions = ref([]);
const searchTerm = ref('');
const searchResults = ref([]);
const isSearching = ref(false);
const showDebugInfo = ref(false);

// Formatted date helper
const formattedDate = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

// Format duration helper
const formattedDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Load all sessions
const loadSessions = async () => {
  try {
    sessions.value = await db.sessions.orderBy('date').reverse().toArray();
    console.log("Loaded sessions:", sessions.value);
  } catch (err) {
    console.error("Error loading sessions:", err);
  }
};

// Navigate to session page
const goToSession = (session) => {
  router.push(`/app//session/${session.id}`);
};

// Start a new recording session
const startNewSession = () => {
  router.push('/app//session/new');
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
  router.push(`/app//session/${sessionId}`);
};

// Toggle debug info
const toggleDebug = () => {
  showDebugInfo.value = !showDebugInfo.value;
};

// Check if device is mobile
const isMobile = () => window.innerWidth <= 768;

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
  
  // Run database diagnostics on load
  diagnoseDatabase().then(message => console.log(message));
});

// Watch for search term changes
import { watch } from 'vue';
watch(searchTerm, (newValue, oldValue) => {
  if (newValue !== oldValue) {
    searchSessions();
  }
});
</script>

<template>
  <div class="dashboard-page">
    <div class="app-container">
      <div class="main-content">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h1 class="h3">Therapy Sessions</h1>
          <button class="btn btn-primary" @click="startNewSession">
            <i class="bi bi-plus-circle me-1"></i> New Session
          </button>
        </div>

        <!-- Search bar -->
        <div class="mb-4">
          <div class="input-group">
            <span class="input-group-text">
              <i class="bi bi-search"></i>
            </span>
            <input type="text" class="form-control" placeholder="Search sessions..." v-model="searchTerm">
          </div>
        </div>

        <!-- Search results -->
        <div v-if="searchTerm && searchResults.length > 0" class="mb-4">
          <h4>Search Results</h4>
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

        <!-- Session list -->
        <div v-if="!searchTerm">
          <h4>All Sessions</h4>
          <div v-if="sessions.length === 0" class="text-center text-muted p-5">
            <i class="bi bi-mic-mute fs-1 d-block mb-3"></i>
            <p>No sessions yet. Start recording a new session.</p>
          </div>

          <div class="session-list">
            <div v-for="session in sessions" :key="session.id" class="session-card" @click="goToSession(session)">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h5 class="mb-0">
                  {{ formattedDate(session.date) }}
                </h5>
                <span class="badge" :class="{
                  'bg-success': session.status === 'completed',
                  'bg-warning': session.status === 'processing',
                  'bg-danger': session.status === 'error',
                  'bg-primary': session.status === 'recorded'
                }">
                  {{ session.status }}
                </span>
              </div>
              <p v-if="session.clientName" class="client-name mb-1">{{ session.clientName }}</p>
              <small class="text-muted">Duration: {{ formattedDuration(session.duration) }}</small>
            </div>
          </div>
        </div>

        <div v-if="showDebugInfo" class="mt-4 p-3 border rounded bg-light">
          <h5>Debug Information</h5>
          <div>
            <p><strong>Sessions count:</strong> {{ sessions.length }}</p>
          </div>
          <button class="btn btn-sm btn-outline-secondary" @click="diagnoseDatabase">Run Diagnostics</button>
        </div>

        <div class="mt-4 text-center">
          <button class="btn btn-sm btn-outline-secondary" @click="toggleDebug">
            {{ showDebugInfo ? 'Hide Debug' : 'Show Debug' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@import '../../../scss/variables.module.scss';

.dashboard-page {
  // ...existing code...
  
  .app-container {
    position: relative;
    min-height: 100vh;
    padding: 1rem;
  }

  .main-content {
    max-width: 1000px;
    margin: 0 auto;
    padding: 1rem;
  }

  .session-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }

  .session-card {
    padding: 1rem;
    border: 1px solid #dee2e6;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.2s ease;
    background-color: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .session-card:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    border-color: #adb5bd;
  }

  .client-name {
    color: #0d6efd;
    font-weight: 500;
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
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .search-result:hover {
    background-color: #e9ecef;
  }

  .search-result-title {
    font-weight: bold;
    margin-bottom: 0.25rem;
  }

  .no-results {
    text-align: center;
    padding: 2rem;
    color: #6c757d;
    border: 1px dashed #dee2e6;
    border-radius: 0.25rem;
  }
  
  // Responsive styles
  @media (max-width: 768px) {
    .session-list {
      grid-template-columns: 1fr;
    }
  }
}
</style>