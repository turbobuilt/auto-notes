// Audio recording service that handles both standard browsers and Safari

export interface RecordingOptions {
  onDataAvailable?: (blob: Blob) => void;
  onRecordingComplete?: (blob: Blob, duration: number) => void;
  onTimeUpdate?: (seconds: number) => void;
}

export class RecorderService {
  private isRecording: boolean = false;
  private recordingTime: number = 0;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private timerInterval: number | null = null;
  private audioStream: MediaStream | null = null;
  
  // Safari specific
  private isSafariBrowser: boolean;
  private mp3Encoder: any = null;
  private mp3Chunks: Uint8Array[] = [];
  private audioProcessor: ScriptProcessorNode | null = null;
  private audioContext: AudioContext | null = null;
  
  constructor() {
    this.isSafariBrowser = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    // For testing/debugging:
    // this.isSafariBrowser = false;
  }

  // Utility methods
  public blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
  }

  public arrayBufferToBlob(buffer: ArrayBuffer, mimeType?: string): Blob {
    return new Blob([buffer], { type: mimeType || 'audio/webm' });
  }

  // Get current recording state
  public getIsRecording(): boolean {
    return this.isRecording;
  }

  // Get current recording time in seconds
  public getRecordingTime(): number {
    return this.recordingTime;
  }

  // Get current audio stream (for visualizer)
  public getAudioStream(): MediaStream | null {
    return this.audioStream;
  }

  // Start recording with options for callbacks
  public async startRecording(options: RecordingOptions = {}): Promise<void> {
    if (this.isRecording) {
      return;
    }
    
    try {
      // Get audio with optimized constraints for smaller file size
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // Mono audio instead of stereo
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100, // Standard sample rate for better compatibility
        }
      });

      this.audioStream = stream;

      if (this.isSafariBrowser) {
        // Safari path - use lamejs to encode to MP3
        await this.startSafariRecording(options);
      } else {
        // Standard browsers path - use MediaRecorder
        await this.startStandardRecording(options);
      }

      // Start timer
      this.isRecording = true;
      this.recordingTime = 0;
      this.timerInterval = window.setInterval(() => {
        this.recordingTime++;

        if (options.onTimeUpdate) {
          options.onTimeUpdate(this.recordingTime);
        }

        // Stop after 1 hour and 15 minutes (4500 seconds)
        if (this.recordingTime >= 4500) {
          this.stopRecording(options);
        }
      }, 1000);
    } catch (err) {
      console.error("Recording error:", err);
      throw err;
    }
  }

  // Stop the current recording
  public stopRecording(options: RecordingOptions = {}): void {
    if (!this.isRecording) {
      return;
    }

    if (this.isSafariBrowser) {
      // Safari: Finish MP3 encoding
      this.stopSafariRecording(options);
    } else if (this.mediaRecorder) {
      // Standard browsers: Stop MediaRecorder
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    // Common cleanup
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.isRecording = false;

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
  }

  private async startStandardRecording(options: RecordingOptions): Promise<void> {
    if (!this.audioStream) {
      throw new Error("Audio stream is not available");
    }
    
    // Standard recording with MediaRecorder (Chrome, Firefox, etc.)
    let recordingOptions: MediaRecorderOptions | undefined;

    // Try to use efficient codecs
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      recordingOptions = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 24000
      };
    } else if (MediaRecorder.isTypeSupported('audio/webm')) {
      recordingOptions = {
        mimeType: 'audio/webm',
        audioBitsPerSecond: 24000
      };
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      recordingOptions = {
        mimeType: 'audio/mp4',
        audioBitsPerSecond: 24000
      };
    }

    // Check if the browser supports these options
    if (recordingOptions && MediaRecorder.isTypeSupported(recordingOptions.mimeType)) {
      console.log(`Using codec: ${recordingOptions.mimeType}`);
      this.mediaRecorder = new MediaRecorder(this.audioStream, recordingOptions);
    } else {
      // Fallback to default
      console.log('Codec not supported, using default codec');
      this.mediaRecorder = new MediaRecorder(this.audioStream);
      console.log(`Fallback codec: ${this.mediaRecorder.mimeType}`);
    }

    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (e) => {
      this.audioChunks.push(e.data);
      if (options.onDataAvailable) {
        options.onDataAvailable(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      console.log(`Creating blob with mime type: ${mimeType}`);

      const audioBlob = new Blob(this.audioChunks, { type: mimeType });
      console.log(`Blob created, size: ${audioBlob.size} bytes`);

      if (options.onRecordingComplete) {
        options.onRecordingComplete(audioBlob, this.recordingTime);
      }
    };

    // Start recording with smaller chunks for better compression
    this.mediaRecorder.start(1000);
  }

  private async startSafariRecording(options: RecordingOptions): Promise<void> {
    if (!this.audioStream) {
      throw new Error("Audio stream is not available");
    }
    
    console.log("Starting Safari recording with MP3 encoding");

    // Initialize audio context
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
    }

    const sampleRate = this.audioContext.sampleRate;
    console.log("Audio context sample rate:", sampleRate);

    // Initialize MP3 encoder with mono audio and better bitrate
    // Lower bitrate for speech (64kbps is sufficient for voice)
    this.mp3Encoder = new (window as any).lamejs.Mp3Encoder(1, sampleRate, 64);
    this.mp3Chunks = [];

    // Create audio source from stream
    const source = this.audioContext.createMediaStreamSource(this.audioStream);

    // Use a larger buffer size for more stable processing
    // Must be a power of 2: 4096, 8192, or 16384
    const bufferSize = 8192;
    let scriptNode;

    if (this.audioContext.createScriptProcessor) {
      scriptNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
    } else {
      scriptNode = (this.audioContext as any).createJavaScriptNode(bufferSize, 1, 1);
    }

    this.audioProcessor = scriptNode;

    scriptNode.onaudioprocess = (audioProcessingEvent: AudioProcessingEvent) => {
      if (!this.isRecording) return;

      const inputBuffer = audioProcessingEvent.inputBuffer;
      const inputData = inputBuffer.getChannelData(0);

      // Convert float32 to int16 more efficiently
      // Use 1152 samples per MP3 frame (standard for MP3)
      const sampleBlockSize = 1152;
      const numBlocks = Math.floor(inputData.length / sampleBlockSize);

      // Process complete blocks only
      for (let i = 0; i < numBlocks; i++) {
        const sampleChunk = new Int16Array(sampleBlockSize);
        const blockOffset = i * sampleBlockSize;

        // Convert and apply volume normalization
        for (let j = 0; j < sampleBlockSize; j++) {
          // Scale to int16 range with a slight volume boost if needed
          // Clamp values to prevent overflow
          const sample = Math.max(-1, Math.min(1, inputData[blockOffset + j])) * 0x7FFF;
          sampleChunk[j] = Math.round(sample);
        }

        // Encode complete chunk to mp3
        const mp3Data = this.mp3Encoder.encodeBuffer(sampleChunk);
        if (mp3Data.length > 0) {
          this.mp3Chunks.push(new Uint8Array(mp3Data));
        }
      }
    };

    // Connect nodes
    source.connect(scriptNode);
    scriptNode.connect(this.audioContext.destination);
  }

  private stopSafariRecording(options: RecordingOptions): void {
    // Finish MP3 encoding and create blob
    if (this.audioProcessor) {
      this.audioProcessor.disconnect();
      this.audioProcessor = null;
    }

    console.log("Finishing Safari MP3 recording");

    // Get the final buffer of mp3 data
    const mp3Data = this.mp3Encoder.flush();
    if (mp3Data.length > 0) {
      this.mp3Chunks.push(new Uint8Array(mp3Data));
    }

    // Concatenate all mp3 chunks more efficiently
    let totalLength = 0;
    this.mp3Chunks.forEach(chunk => {
      totalLength += chunk.length;
    });

    const finalBuffer = new Uint8Array(totalLength);
    let offset = 0;

    this.mp3Chunks.forEach(chunk => {
      finalBuffer.set(chunk, offset);
      offset += chunk.length;
    });

    // Create MP3 blob with explicit MIME type
    const mp3Blob = new Blob([finalBuffer], { type: 'audio/mp3' });
    console.log(`MP3 Blob created, size: ${mp3Blob.size} bytes`);

    if (options.onRecordingComplete) {
      options.onRecordingComplete(mp3Blob, this.recordingTime);
    }
  }
}

// Create singleton instance
export const recorderService = new RecorderService();
