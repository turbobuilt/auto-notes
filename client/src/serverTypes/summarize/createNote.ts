import callMethod from "../../lib/callMethod";

export default function createNote(audioBlob: any) {
    return callMethod("summarize.createNote", [...arguments]) as Promise<{ error?: string, data: void }>;
};
