# Whisper Web Library

A lightweight library for performing audio transcription using Whisper models directly in the browser.

## Installation

```bash
npm install whisper-web-lib
```

## Usage

```typescript
import { transcribeAudio } from 'whisper-web-lib';

// From an ArrayBuffer (e.g., from fetch)
const audioResponse = await fetch('audio.mp3');
const arrayBuffer = await audioResponse.arrayBuffer();

const transcription = transcribeAudio(arrayBuffer, {
  model: 'Xenova/whisper-tiny', // Default model
  multilingual: false,          // Use English-only model
  quantized: true,              // Use quantized model for better performance
  onProgress: (progress) => {   // Optional progress callback
    console.log(`Loading ${progress.file}: ${Math.round(progress.progress * 100)}%`);
  }
});

// Async iterator that yields results as they're available
for await (const result of transcription) {
  console.log('Current text:', result.text);
  
  // Process chunks with timestamps
  for (const chunk of result.chunks) {
    const [start, end] = chunk.timestamp;
    console.log(`${formatTime(start)} -> ${formatTime(end)}: ${chunk.text}`);
  }
  
  if (result.isComplete) {
    console.log('Transcription complete!');
  }
}
```

## API

### transcribeAudio(audioData, options)

Transcribes audio and returns an async iterator with progressive results.

#### Parameters

- `audioData`: `ArrayBuffer | Float32Array` - The audio data to transcribe
- `options`: Object with the following properties:
  - `model`: String - Model name (default: 'Xenova/whisper-tiny')
  - `multilingual`: Boolean - Whether to use multilingual model (default: false)
  - `quantized`: Boolean - Whether to use quantized model (default: true)
  - `subtask`: 'transcribe' | 'translate' - Task to perform (default: 'transcribe')
  - `language`: String - Language code (default: 'english')
  - `chunkLengthS`: Number - Length of audio chunks in seconds
  - `strideLengthS`: Number - Stride between chunks in seconds
  - `onProgress`: Function - Progress callback for model loading

#### Returns

An AsyncGenerator that yields `TranscriptionResult` objects:

```typescript
interface TranscriptionResult {
  text: string;                              // Full transcription text
  chunks: { 
    text: string;                           // Text of this chunk
    timestamp: [number, number | null]      // [start, end] timestamps
  }[];
  isComplete: boolean;                      // Whether transcription is complete
}
```

## Supported Models

- `Xenova/whisper-tiny`
- `Xenova/whisper-base`
- `Xenova/whisper-small`
- `Xenova/whisper-medium`
- `distil-whisper/distil-medium.en`
- `distil-whisper/distil-large-v2`
