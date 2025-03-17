import WorkerModule from './worker?worker';

export async function transcribeAudio(
    audioData: ArrayBuffer | Float32Array,
    options: {
        model?: string;
        multilingual?: boolean;
        quantized?: boolean;
        subtask?: 'transcribe' | 'translate';
        language?: string;
        chunkLengthS?: number;
        strideLengthS?: number;
        onProgress?: (progress: { file: string; loaded: number; progress: number; total: number; name: string; status: string }) => void;
    } = {}
): Promise<AsyncGenerator<TranscriptionResult, void, unknown>> {
    const { 
        model = 'Xenova/whisper-tiny', 
        multilingual = false, 
        quantized = true,
        subtask = 'transcribe',
        language = 'english',
        chunkLengthS,
        strideLengthS,
        onProgress
    } = options;
    
    // Create worker using Vite's worker import
    const worker = new WorkerModule();
    
    // Set up audio data
    let audioFloat32Array: Float32Array;
    
    if (audioData instanceof ArrayBuffer) {
        // If input is an ArrayBuffer, we need to decode it
        const audioContext = new AudioContext({ sampleRate: 16000 });
        const audioBuffer = await audioContext.decodeAudioData(audioData);
        
        // Convert to mono if necessary
        if (audioBuffer.numberOfChannels === 2) {
            const SCALING_FACTOR = Math.sqrt(2);
            const left = audioBuffer.getChannelData(0);
            const right = audioBuffer.getChannelData(1);
            
            audioFloat32Array = new Float32Array(left.length);
            for (let i = 0; i < audioBuffer.length; ++i) {
                audioFloat32Array[i] = SCALING_FACTOR * (left[i] + right[i]) / 2;
            }
        } else {
            audioFloat32Array = audioBuffer.getChannelData(0);
        }
    } else {
        // Already a Float32Array
        audioFloat32Array = audioData;
    }
    
    // Set up async iterator
    let resolveNext: ((value: TranscriptionResult | null) => void) | null = null;
    let nextPromise: Promise<TranscriptionResult | null>;
    let isCompleted = false;
    let latestResult: TranscriptionResult | null = null;
    
    const setupNextPromise = () => {
        nextPromise = new Promise<TranscriptionResult | null>((resolve) => {
            resolveNext = resolve;
            // If we already have results waiting, resolve immediately
            if (latestResult !== null) {
                const result = latestResult;
                latestResult = null;
                resolve(result);
            }
        });
    };
    
    // Set up initial promise
    setupNextPromise();
    
    // Set up message handler
    worker.addEventListener('message', (event) => {
        const message = event.data;
        console.log("got messge", event)
        
        switch (message.status) {
            case 'progress':
                if (onProgress) {
                    onProgress(message);
                }
                break;
                
            case 'update':
                const updateResult: TranscriptionResult = {
                    text: message.data[0],
                    chunks: message.data[1].chunks,
                    isComplete: false
                };
                
                if (resolveNext) {
                    resolveNext(updateResult);
                    setupNextPromise();
                } else {
                    latestResult = updateResult;
                }
                break;
                
            case 'complete':
                const completeResult: TranscriptionResult = {
                    text: message.data.text,
                    chunks: message.data.chunks,
                    isComplete: true
                };
                
                if (resolveNext) {
                    resolveNext(completeResult);
                    resolveNext = null;
                } else {
                    latestResult = completeResult;
                }
                
                isCompleted = true;
                break;
                
            case 'error':
                if (resolveNext) {
                    resolveNext(null);
                    resolveNext = null;
                }
                isCompleted = true;
                throw new Error(message.data.message || 'Transcription failed');
        }
    });
    console.log('wills tart')
    // Start transcription
    worker.postMessage({
        audio: audioFloat32Array,
        model,
        multilingual,
        quantized,
        subtask: multilingual ? subtask : null,
        language: multilingual && language !== 'auto' ? language : null,
        chunkLengthS,
        strideLengthS
    });
    
    // Return async iterator
    return {
        async next() {
            if (isCompleted && !latestResult && !resolveNext) {
                return { done: true, value: undefined };
            }
            
            const result = await nextPromise;
            
            if (!result) {
                return { done: true, value: undefined };
            }
            
            if (result.isComplete) {
                isCompleted = true;
            } else {
                setupNextPromise();
            }
            
            return { done: false, value: result };
        },
        
        async return() {
            // Clean up
            worker.terminate();
            return { done: true, value: undefined };
        },
        
        [Symbol.asyncIterator]() {
            return this;
        }
    };
}

export interface TranscriptionResult {
    text: string;
    chunks: { text: string; timestamp: [number, number | null] }[];
    isComplete: boolean;
}

export { formatAudioTimestamp } from './audio-utils';