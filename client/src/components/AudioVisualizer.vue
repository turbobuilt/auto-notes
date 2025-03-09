<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';

// Props to receive from parent
const props = defineProps({
  audioStream: {
    type: Object,
    default: null
  },
  isRecording: {
    type: Boolean,
    default: false
  }
});

// Audio visualization variables
const audioContext = ref(null);
const audioAnalyser = ref(null);
const audioSource = ref(null);
const visualizerCanvas = ref(null);
const visualizerCanvasCtx = ref(null);
const animationId = ref(null);

// Setup visualization when component mounts
onMounted(() => {
  // Get canvas element reference
  visualizerCanvas.value = document.getElementById('visualizer');
  if (visualizerCanvas.value) {
    visualizerCanvasCtx.value = visualizerCanvas.value.getContext('2d');
  }
  
  // If already recording when component mounts, set up visualization
  if (props.isRecording && props.audioStream) {
    setupAudioVisualizer(props.audioStream);
  }
});

// Clean up resources when component unmounts
onBeforeUnmount(() => {
  stopAudioVisualization();
});

// Watch for changes in the audioStream prop
watch(() => props.audioStream, (newStream) => {
  if (newStream && props.isRecording) {
    setupAudioVisualizer(newStream);
  } else {
    stopAudioVisualization();
  }
});

// Watch for changes in isRecording prop
watch(() => props.isRecording, (isRecording) => {
  if (!isRecording) {
    stopAudioVisualization();
  }
});

// Set up audio visualizer with the provided stream
const setupAudioVisualizer = (stream) => {
  if (!visualizerCanvas.value) return;
  
  try {
    // Create audio context if it doesn't exist
    if (!audioContext.value) {
      audioContext.value = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    // Create analyzer node
    audioAnalyser.value = audioContext.value.createAnalyser();
    audioAnalyser.value.fftSize = 256;
    const bufferLength = audioAnalyser.value.frequencyBinCount;
    
    // Create audio source from stream
    if (audioSource.value) {
      audioSource.value.disconnect();
    }
    audioSource.value = audioContext.value.createMediaStreamSource(stream);
    audioSource.value.connect(audioAnalyser.value);
    
    // Start visualization
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!visualizerCanvasCtx.value || !audioAnalyser.value) return;
      
      animationId.value = requestAnimationFrame(draw);
      
      audioAnalyser.value.getByteFrequencyData(dataArray);
      
      const width = visualizerCanvas.value.width;
      const height = visualizerCanvas.value.height;
      
      visualizerCanvasCtx.value.clearRect(0, 0, width, height);
      visualizerCanvasCtx.value.fillStyle = '#f8f9fa';
      visualizerCanvasCtx.value.fillRect(0, 0, width, height);
      
      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 255 * height;
        
        // Use a gradient for visualization
        const gradient = visualizerCanvasCtx.value.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#0d6efd');
        gradient.addColorStop(1, '#198754');
        
        visualizerCanvasCtx.value.fillStyle = gradient;
        visualizerCanvasCtx.value.fillRect(x, height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
      }
    };
    
    draw();
  } catch (err) {
    console.error("Error setting up audio visualizer:", err);
  }
};

// Stop visualization and clean up resources
const stopAudioVisualization = () => {
  if (animationId.value) {
    cancelAnimationFrame(animationId.value);
    animationId.value = null;
  }
  
  if (audioSource.value) {
    audioSource.value.disconnect();
    audioSource.value = null;
  }
  
  if (audioAnalyser.value) {
    audioAnalyser.value = null;
  }
  
  if (visualizerCanvasCtx.value && visualizerCanvas.value) {
    visualizerCanvasCtx.value.clearRect(0, 0, visualizerCanvas.value.width, visualizerCanvas.value.height);
  }
};

// Resize canvas to fill container
const resizeCanvas = () => {
  if (visualizerCanvas.value) {
    visualizerCanvas.value.width = visualizerCanvas.value.parentElement.clientWidth;
  }
};

// Set up resize listener
onMounted(() => {
  window.addEventListener('resize', resizeCanvas);
  // Call once to set initial size
  resizeCanvas();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCanvas);
});
</script>

<template>
  <div class="audio-visualizer-container">
    <canvas id="visualizer" class="audio-visualizer" height="100"></canvas>
  </div>
</template>

<style scoped>
.audio-visualizer-container {
  width: 100%;
  margin: 1rem 0;
}

.audio-visualizer {
  width: 100%;
  height: 100px;
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #dee2e6;
}

@media (max-width: 768px) {
  .audio-visualizer {
    height: 60px;
  }
}
</style>
