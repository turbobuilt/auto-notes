import callMethod from "../../lib/callMethod";

export default function message(body) {
    return callMethod("videoCall.message", [...arguments]) as Promise<{ error?: string, data: { success: boolean; } }>;
};
