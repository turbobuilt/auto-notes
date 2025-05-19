import callMethod from "../../lib/callMethod";

export default function message(body) {
    return callMethod("videoCall.message", [...arguments], {"useFormData":false,"streamResponse":false,"keepAlive":false}) as Promise<{ error?: string, data: { success: boolean; } }>;
};
