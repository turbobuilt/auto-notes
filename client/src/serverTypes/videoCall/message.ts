import callMethod from "../../lib/callMethod";

export default function message() {
    return callMethod("videoCall.message", [...arguments]) as Promise<{ error?: string, data: { success: boolean; } }>;
};
