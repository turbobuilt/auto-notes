import { transcribeAudio, formatAudioTimestamp } from './index';

export async function example() {
    // Get audio from a file or microphone
    const audioResponse = await fetch('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav');
    const audioData = await audioResponse.arrayBuffer();
    
    console.log('Starting transcription...');
    
    const transcription = await transcribeAudio(audioData, {
        model: 'Xenova/whisper-tiny',
        onProgress: (progress) => {
            console.log(`Loading ${progress.file}: ${Math.round(progress.progress * 100)}%`);
        }
    });
    
    // Process results as they come
    for await (const result of transcription) {
        console.clear();
        console.log('Current text:', result.text);
        
        console.log('\nChunks with timestamps:');
        for (const chunk of result.chunks) {
            const [start, end] = chunk.timestamp;
            console.log(`${formatAudioTimestamp(start)} -> ${end ? formatAudioTimestamp(end) : 'ongoing'}: ${chunk.text}`);
        }
        
        if (result.isComplete) {
            console.log('\nTranscription complete!');
        }
    }
}

example().catch(console.error);
