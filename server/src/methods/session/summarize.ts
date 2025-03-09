import { route } from "lib/route";
import fetch from "node-fetch"

export default route(async function (params, audioBlob: any) {
    let { req, res } = params;

    console.log("Starting transcription process...");

    // Collect all data from the client request
    const chunks = [];
    for await (const chunk of req) {
        console.log("Received chunk", chunk.length);
        chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);
    console.log("Total audio data collected:", audioBuffer.length, "bytes");

    // Generate a boundary for multipart form-data
    const boundary = `--------------------------${Math.random().toString(36).substring(2)}`;

    // Create the complete multipart form data manually
    let formData = '';

    // Add form parameters
    const formParams = [
        ["vad_model", "silero"],
        ["alignment_model", "tdnn_ffn"],
        ["preprocessing", "none"],
        ["temperature", "0"],
        ["timestamp_granularities", "segment"],
        ["audio_window_seconds", "5"],
        ["speculation_window_words", "4"]
    ];

    for (const [name, value] of formParams) {
        formData += `--${boundary}\r\n`;
        formData += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
        formData += `${value}\r\n`;
    }

    // Add file part header
    formData += `--${boundary}\r\n`;
    formData += `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n`;
    formData += `Content-Type: ${req.headers["content-type"] || "audio/wav"}\r\n\r\n`;

    // Convert form data to buffer
    const formDataBuffer = Buffer.from(formData, 'utf-8');

    // Create the ending part
    const endingBuffer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');

    // Combine all parts into one buffer
    const completeRequestBody = Buffer.concat([
        formDataBuffer,
        audioBuffer,
        endingBuffer
    ]);

    console.log("Transcribing audio...");

    try {
        const transcriptionResponse = await fetch("https://audio-prod.us-virginia-1.direct.fireworks.ai/v1/audio/transcriptions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.fireworks_ai_api_key}`,
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
            },
            body: completeRequestBody
        });

        if (!transcriptionResponse.ok) {
            const errorText = await transcriptionResponse.text();
            console.error("Fireworks API error:", errorText);
            res.status(transcriptionResponse.status).send(errorText);
            return;
        }

        // Collect the complete response body
        const responseData = await transcriptionResponse.json() as any;

        // Send the complete response to the client
        res.setHeader('Content-Type', 'application/json');
        // res.send(responseData);
        let transcript = responseData.text;


        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.openai_api_key}`
            },
            body: JSON.stringify({
                model: 'o3-mini',  // Using o3-mini as specified
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant that summarizes therapy sessions. Create a concise but comprehensive summary of the key points, insights, and action items from the session transcript.'
                    },
                    {
                        role: 'user',
                        content: transcript
                    }
                ],
                //   temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`Summary error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as any;
        let notes = data.choices[0].message.content;

        return { transcript, notes };
    } catch (e) {
        console.error("Error in transcription:", e);
        res.status(500).send({ error: "Transcription failed" });
        return;
    }
});

