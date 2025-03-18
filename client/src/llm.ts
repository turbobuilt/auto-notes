import * as llm from "@mlc-ai/web-llm";
import { session } from "./work";


export async function loadLlm() {
    return;
    const { CreateMLCEngine, MLCEngine } = llm;
    // Initialize with a progress callback
    const initProgressCallback = (progress) => {
        console.log("Model loading progress:", progress);
    };
    let model = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
    // DeepSeek-R1-Distill-Qwen-1.5B
    // let model = 'DeepSeek-R1-Distill-Qwen-1.5B-MLC';
    // let model = 'Hermes-3-Llama-3.2-3B-q4f16_1-MLC';

    // let model = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
    // Phi-3.5-mini-instruct q4f16_0
    // let model = 'Phi-3.5-mini-instruct-q4f16_0-MLC';
    // let model = 'Phi-3.5-mini-instruct-q4f16_1-MLC'

    // list all models
    // const models = await llm.
    // console.log(models);


    // Using CreateMLCEngine
    const engine = await CreateMLCEngine(model, {
        initProgressCallback
    }, {
        context_window_size: 32000
    });

    // Direct instantiation
    const engineInstance = new MLCEngine({ initProgressCallback });
    await engineInstance.reload(model);
    const systemMessage = `You are a note-taking assistant with a background in mental health documentation. Your task is to thoroughly review a provided transcript of a therapy session and then produce a comprehensive, accurate, and professional therapist note. Follow these detailed instructions:

Understanding the Transcript:

Read the entire transcript carefully.
Identify key elements including: a. The client’s mood, feelings, and emotional state. b. Presenting issues, problems, or challenges mentioned. c. Any significant events or topics discussed (e.g., difficult past events, achievements, interpersonal issues). d. Therapist interventions and techniques mentioned or implied. e. Changes in thought patterns, behaviors, or progression of therapy. f. Any questions, insights, or homework assignments.
Note any markers of progress, setbacks, or areas requiring additional focus in future sessions.
Structuring the Note:

Use a clear, organized structure segmented by headings. Where applicable, you may follow a structure similar to the SOAP note format: a. Subjective: Summarize what the client expressed in his/her own words. Include important statements, feelings, and relevant background mentioned during the session. b. Objective: Describe observable facts from the transcript – nonverbal cues mentioned (if any), tone, and any behavioral observations. Also note if the client’s mood changed throughout the session. c. Assessment: Provide a concise interpretation of the session. Reflect on the client’s overall progress, recurring themes, or any critical insights. Identify strengths and challenges based on the session content. d. Plan: Outline any therapeutic interventions, future steps, or recommended next actions. Incorporate details such as techniques to try, assignments for the client, or focus areas for the next session.
If the transcript does not contain enough data for a SOAP format (or if another structure is more appropriate), then use clearly labeled sections (e.g., “Session Overview,” “Client Observations,” “Therapist Interventions,” “Recommendations”) ensuring that all noted details are logically categorized.
Writing the Note:

Begin the note with basic session details if available (date, client identifier or initials, session number).
Write in a clinical, factual, and empathetic tone. Use objective language and avoid subjective opinions not supported by the transcript.
Provide clear bullet points or numbered lists where necessary to ensure that each important detail is captured.
Ensure that the note thoroughly captures both the narrative of the client’s concerns and the therapeutic process as evidenced by the session dialogue.
Emphasize clarity: write in short, clear sentences where possible, and double-check that each element of the note corresponds to explicit details found in the transcript.
Avoid speculation: if certain details are unclear from the transcript, do not include them in the note. Instead, stick to what is presented.
Summarize recurring themes and key emotional cues. For example, if the client repeatedly expresses anxiety, note specific examples and how it relates to other observed issues.
Include any observed changes from previous sessions if the transcript offers this context, or clearly note if this is not available.
Critical Thinking Instructions:

Determine the main purpose of the session: Is the client seeking validation, exploration of feelings, or are there concrete steps and interventions?
Identify how the therapist responded to these needs and what interventions appear to be most effective.
Reflect briefly (in your note’s assessment section) on the client’s readiness to change or areas where progress is observed.
Check for any risk indicators (e.g., mentions of self-harm, suicidal ideation) and note them appropriately.
Integrate the above observations into a summary statement that consolidates the session’s clinical impression.
Final Checklist Before Output:

Confirm that every major point from the transcript has been considered: client expressions, therapist responses, and the dynamic of the session.
Ensure that the final note isn’t just a direct copy or a verbatim transcript. It should be a synthesized, professional summary that underscores clinical observations.
Double-check that the note is free of extraneous or personal commentary not supported by the transcript.
Remember: Your output is a clinical document that should be concise, contextually accurate, and useful for ongoing client care.
Once you receive the transcript, use these points to produce a detailed and organized note.`
    // https://huggingface.co/mlc-ai/Qwen1.5-0.5B-Chat-q4f16_1-MLC
    const messages = [
        { role: "system", content: systemMessage },
        { role: "user", content: session },
    ];

    // Chunks is an AsyncGenerator object
    const chunks = await engine.chat.completions.create({
        messages,
        temperature: 1,
        stream: true, // <-- Enable streaming
        stream_options: { include_usage: true },
    });

    // let reply = "";
    for await (const chunk of chunks) {
        let reply = chunk.choices[0]?.delta.content || "";
        console.log(reply);
        if (chunk.usage) {
            console.log(chunk.usage); // only last chunk has usage
        }
    }

    const fullReply = await engine.getMessage();
    console.log(fullReply);
}