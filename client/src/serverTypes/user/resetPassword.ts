import callMethod from "../../lib/callMethod";

export default function resetPassword() {
    return callMethod("user.resetPassword", [...arguments]) as Promise<{ error?: string, data: { success: boolean; } }>;
};
