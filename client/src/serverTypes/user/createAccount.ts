import callMethod from "../../lib/callMethod";

export default function createAccount({ email, password }) {
    return callMethod("user.createAccount", [...arguments]) as Promise<{ error?: string, data: { user: { id: string; created: number; updated: number; firstName: string; lastName: string; email: string; phone: string; }; authToken: string; expires: number; } }>;
};
