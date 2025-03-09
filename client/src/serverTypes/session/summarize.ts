import callMethod from "../../lib/callMethod";

export default function summarize(audioBlob: any) {
    return callMethod("session.summarize", [...arguments]) as Promise<{ error?: string, data: { transcript: any; notes: any; } }>;
};
