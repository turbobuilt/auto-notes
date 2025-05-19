<script lang="ts" setup>
import { ref, onMounted, watch } from 'vue';

// Props definition
const props = defineProps({
  stream: {
    type: MediaStream,
    required: true
  },
  connectionId: {
    type: String,
    required: true
  },
  isLocal: {
    type: Boolean,
    default: false
  },
  connectionStatus: {
    type: String as () => 'active' | 'stale' | 'dead' | null,
    default: null
  },
  label: {
    type: String,
    default: ''
  },
  isScreenSharing: {
    type: Boolean,
    default: false
  },
  size: {
    type: String as () => 'main' | 'sidebar' | 'floating',
    default: 'sidebar'
  }
});

const emit = defineEmits<{
  (e: 'stream-change', { aspectRatio }): void;
}>();

const d = reactive({
  aspectRatio: 1
})

const videoRef = ref<HTMLVideoElement | null>(null);

// Set up video stream when component mounts or stream changes
onMounted(() => {
  if (videoRef.value && props.stream) {
    videoRef.value.srcObject = props.stream;
    d.aspectRatio = videoRef.value.srcObject.getVideoTracks()[0].getSettings().aspectRatio;
  }
});

watch(() => props.stream, (newStream) => {
  if (videoRef.value && newStream) {
    videoRef.value.srcObject = newStream;
    d.aspectRatio = newStream.getVideoTracks()[0].getSettings().aspectRatio;
  }
}, { immediate: true });
</script>

<template>
  <div class="video-participant" :class="[`size-${size}`, { 'is-local': isLocal }, { 'is-screen-sharing': isScreenSharing }]" :data-connection-id="connectionId" :style="{ aspectRatio: size === 'floating' || 'sidebar' ? d.aspectRatio : null }">
    <video ref="videoRef" autoplay :muted="isLocal || size === 'sidebar'" playsinline></video>
    <div class="connection-id-overlay" :class="{ 'local': isLocal, 'main': size === 'main' }">
      {{ connectionId }}
    </div>
    <div class="video-label">
      {{ label || (isLocal ? 'You' + (isScreenSharing ? ' (Screen Sharing)' : '') : 'Participant') }}
    </div>
    <!-- Connection status indicators -->
    <div v-if="connectionStatus" class="connection-status-badge" :class="`status-${connectionStatus}`">
      {{ connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1) }}
    </div>

    <!-- Connection overlay for stale/dead connections -->
    <div v-if="connectionStatus === 'stale' || connectionStatus === 'dead'" class="connection-overlay">
      <div class="spinner"></div>
      <div class="connection-message">
        {{ connectionStatus === 'stale' ? 'Connection unstable...' : 'Connection lost. Reconnecting...' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.video-participant {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  background-color: #000;
}

.video-participant video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.connection-message {
  padding: 10px;
  text-align: center;
}

/* Sizing variants */
.size-main {
  width: 100%;
  height: 100%;
}

.size-sidebar {
  width: 100%;
  height: 150px;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.size-sidebar:hover {
  transform: scale(1.05);
}

/* Status indicators, overlays etc. are inherited from the global styles */

@media (max-width: 768px) {
  .size-floating {
    width: 100%;
    height: 100%;
  }

  .size-sidebar {
    width: 180px;
    min-width: 180px;
    height: 100%;
  }
}
</style>
