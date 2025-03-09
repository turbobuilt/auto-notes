import callMethod from "../../lib/callMethod";

export default function me() {
    return callMethod("user.me", [...arguments]) as Promise<{ error?: string, data: { user: any; } }>;
};
