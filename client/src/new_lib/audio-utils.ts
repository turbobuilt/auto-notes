/**
 * Formats audio timestamp into a string HH:MM:SS format
 */
export function formatAudioTimestamp(time: number): string {
    const padTime = (time: number) => String(time).padStart(2, "0");
    
    const hours = (time / (60 * 60)) | 0;
    time -= hours * (60 * 60);
    const minutes = (time / 60) | 0;
    time -= minutes * 60;
    const seconds = time | 0;
    return `${hours ? padTime(hours) + ":" : ""}${padTime(minutes)}:${padTime(
        seconds,
    )}`;
}

/**
 * Converts blob audio to a Float32Array
 */
export async function blobToFloat32Array(
    blob: Blob, 
    sampleRate: number = 16000
): Promise<Float32Array> {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate });
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    if (audioBuffer.numberOfChannels === 2) {
        const SCALING_FACTOR = Math.sqrt(2);
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        
        const output = new Float32Array(left.length);
        for (let i = 0; i < audioBuffer.length; ++i) {
            output[i] = SCALING_FACTOR * (left[i] + right[i]) / 2;
        }
        return output;
    }
    
    return audioBuffer.getChannelData(0);
}
