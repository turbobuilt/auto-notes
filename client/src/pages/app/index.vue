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
  router.push(`/app/session/${session.id}`);
};

// Start a new recording session
const startNewSession = () => {
  router.push('/app/session/new');
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
  router.push(`/app/session/${sessionId}`);
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
        <div class="header-row">
          <h1>Therapy Sessions</h1>
          <button class="primary-button" @click="startNewSession">
            <span class="icon">+</span> New Recorded Session
          </button>
          <v-btn class="primary-button" to="/app/video-call/new">
            <span class="icon">+</span> New Video Session
          </v-btn>
        </div>

        <!-- Search bar -->
        <div class="search-container">
          <div class="search-input">
            <span class="search-icon">🔍</span>
            <input type="text" placeholder="Search sessions..." v-model="searchTerm">
          </div>
        </div>

        <!-- Search results -->
        <div v-if="searchTerm && searchResults.length > 0" class="search-results-container">
          <h4>Search Results</h4>
          <div v-for="result in searchResults" :key="result.session.id" class="search-result">
            <div class="search-result-title" @click="selectSearchResult(result.session.id)">
              {{ formattedDate(result.session.date) }}
              <span v-if="result.session.clientName" class="client-name">
                - {{ result.session.clientName }}
              </span>
            </div>
            <div v-for="(match, index) in result.matches" :key="index" @click="selectSearchResult(result.session.id)">
              <div class="match-text" v-html="match.text"></div>
              <div class="match-source">From {{ match.source }}</div>
            </div>
          </div>
        </div>

        <!-- No results message -->
        <div v-else-if="searchTerm && isSearching" class="no-results">
          <div class="spinner"></div>
          <div>Searching...</div>
        </div>

        <div v-else-if="searchTerm && !isSearching" class="no-results">
          No results found for "{{ searchTerm }}"
        </div>

        <!-- Session list -->
        <div v-if="!searchTerm">
          <h4>All Sessions</h4>
          <div v-if="sessions.length === 0" class="empty-state">
            <div class="empty-icon">🎙️</div>
            <p>No sessions yet. Start recording a new session.</p>
          </div>

          <div class="session-list">
            <div v-for="session in sessions" :key="session.id" class="session-card" @click="goToSession(session)">
              <div class="session-header">
                <h5>
                  {{ formattedDate(session.date) }}
                </h5>
                <span class="status-badge" :class="{
                  'status-completed': session.status === 'completed',
                  'status-processing': session.status === 'processing',
                  'status-error': session.status === 'error',
                  'status-recorded': session.status === 'recorded'
                }">
                  {{ session.status }}
                </span>
              </div>
              <p v-if="session.clientName" class="client-name">{{ session.clientName }}</p>
              <div class="session-duration">Duration: {{ formattedDuration(session.duration) }}</div>
            </div>
          </div>
        </div>

        <div v-if="showDebugInfo" class="debug-panel">
          <h5>Debug Information</h5>
          <div>
            <p><strong>Sessions count:</strong> {{ sessions.length }}</p>
          </div>
          <button class="secondary-button" @click="diagnoseDatabase">Run Diagnostics</button>
        </div>

        <div class="debug-toggle">
          <button class="secondary-button small" @click="toggleDebug">
            {{ showDebugInfo ? 'Hide Debug' : 'Show Debug' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@import '../../scss/variables.module.scss';

.dashboard-page {
  font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: $text-dark;
  line-height: 1.6;
  
  .app-container {
    position: relative;
    min-height: 100vh;
    padding: $spacing-sm;
  }

  .main-content {
    max-width: 1000px;
    margin: 0 auto;
    padding: $spacing-md;
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
    margin-top: $spacing-lg;
    margin-bottom: $spacing-md;
  }
  
  h5 {
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0;
  }
  
  // Header row with title and new session button
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
    
    .icon {
      margin-right: $spacing-xs;
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
  
  // Search styles
  .search-container {
    margin-bottom: $spacing-lg;
  }
  
  .search-input {
    display: flex;
    align-items: center;
    background: $white;
    border-radius: $border-radius-md;
    border: 1px solid #ddd;
    padding: $spacing-xs $spacing-sm;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    
    &:focus-within {
      border-color: $primary;
      box-shadow: 0 0 0 2px rgba($primary, 0.2);
    }
    
    .search-icon {
      margin-right: $spacing-xs;
      color: #888;
    }
    
    input {
      border: none;
      flex: 1;
      outline: none;
      font-size: 1rem;
      padding: $spacing-xs;
    }
  }
  
  // Session list
  .session-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: $spacing-md;
    margin-top: $spacing-md;
  }
  
  .session-card {
    padding: $spacing-md;
    border-radius: $border-radius-lg;
    cursor: pointer;
    transition: all 0.2s ease;
    background-color: $white;
    box-shadow: $shadow-card;
    
    &:hover {
      transform: translateY(-3px);
      box-shadow: $shadow-lg;
    }
    
    .session-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: $spacing-xs;
    }
    
    .client-name {
      color: $primary;
      font-weight: 500;
      margin: $spacing-xs 0;
    }
    
    .session-duration {
      color: $text-muted;
      font-size: 0.9rem;
    }
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
  
  // Empty state
  .empty-state {
    text-align: center;
    padding: $spacing-xxl $spacing-xl;
    color: $text-muted;
    background: $background-light;
    border-radius: $border-radius-lg;
    margin: $spacing-md 0;
    
    .empty-icon {
      font-size: 3rem;
      margin-bottom: $spacing-sm;
    }
  }
  
  // Search results
  .search-results-container {
    margin-bottom: $spacing-lg;
  }
  
  .search-result {
    padding: $spacing-md;
    margin-bottom: $spacing-sm;
    background: $background-light;
    border-left: 3px solid $primary;
    border-radius: $border-radius-md;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background-color 0.2s;
    
    &:hover {
      background: $background-light-alt;
    }
    
    .search-result-title {
      font-weight: 600;
      margin-bottom: $spacing-xs;
    }
    
    .match-source {
      font-size: 0.85rem;
      color: $text-muted;
      margin-top: $spacing-xs;
    }
  }
  
  // Search highlight
  .search-highlight {
    background-color: rgba($secondary, 0.3);
    padding: 0 2px;
    border-radius: 2px;
    font-weight: 600;
  }
  
  // No results
  .no-results {
    text-align: center;
    padding: $spacing-xl;
    color: $text-muted;
    background: $background-light;
    border: 1px dashed #ddd;
    border-radius: $border-radius-md;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: $spacing-sm;
  }
  
  // Spinner
  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba($primary, 0.3);
    border-radius: 50%;
    border-top-color: $primary;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
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
  
  .debug-toggle {
    margin-top: $spacing-md;
    text-align: center;
  }
  
  // Responsive styles
  @media (max-width: $breakpoint-md) {
    .session-list {
      grid-template-columns: 1fr;
    }
    
    .header-row {
      flex-direction: column;
      align-items: flex-start;
      gap: $spacing-md;
    }
  }
}
</style>