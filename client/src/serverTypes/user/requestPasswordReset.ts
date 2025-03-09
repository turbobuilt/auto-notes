import callMethod from "../../lib/callMethod";

export default function requestPasswordReset() {
    return callMethod("user.requestPasswordReset", [...arguments]) as Promise<{ error?: string, data: { success: boolean; } }>;
};
