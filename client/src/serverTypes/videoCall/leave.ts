import callMethod from "../../lib/callMethod";

export default function leave(callId: string, connectionId: string) {
    return callMethod("videoCall.leave", [...arguments], {"useFormData":false,"streamResponse":false,"keepAlive":true}) as Promise<{ error?: string, data: { success: boolean; } }>;
};
