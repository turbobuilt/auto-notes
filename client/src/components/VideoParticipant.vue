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

const videoRef = ref<HTMLVideoElement | null>(null);

// Set up video stream when component mounts or stream changes
onMounted(() => {
  if (videoRef.value && props.stream) {
    videoRef.value.srcObject = props.stream;
  }
});

watch(() => props.stream, (newStream) => {
  if (videoRef.value && newStream) {
    videoRef.value.srcObject = newStream;
  }
});
</script>

<template>
  <div class="video-participant" 
       :class="[
         `size-${size}`, 
         { 'is-local': isLocal },
         { 'is-screen-sharing': isScreenSharing }
       ]"
       :data-connection-id="connectionId">
    
    <video ref="videoRef" autoplay :muted="isLocal || size === 'sidebar'" playsinline></video>
    
    <div class="connection-id-overlay" :class="{ 'local': isLocal, 'main': size === 'main' }">
      {{ connectionId }}
    </div>
    
    <div class="video-label">
      {{ label || (isLocal ? 'You' + (isScreenSharing ? ' (Screen Sharing)' : '') : 'Participant') }}
    </div>
    
    <!-- Connection status indicators -->
    <div v-if="connectionStatus" 
         class="connection-status-badge"
         :class="`status-${connectionStatus}`">
      {{ connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1) }}
    </div>
    
    <!-- Connection overlay for stale/dead connections -->
    <div v-if="connectionStatus === 'stale' || connectionStatus === 'dead'" class="connection-overlay">
      <div class="spinner"></div>
      <div>
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

.size-floating {
  position: absolute;
  width: 180px;
  height: 120px;
  bottom: 20px;
  right: 20px;
  border: 2px solid white;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  z-index: 10;
}

/* Status indicators, overlays etc. are inherited from the global styles */

@media (max-width: 768px) {
  .size-floating {
    width: 100px;
    height: 80px;
  }
  
  .size-sidebar {
    width: 180px;
    min-width: 180px;
    height: 100%;
  }
}
</style>
