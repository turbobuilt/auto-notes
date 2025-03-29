import callMethod from "../../lib/callMethod";

export default function login({ email, password }) {
    return callMethod("user.login", [...arguments]) as Promise<{ error?: string, data: { authToken: string; user: { id: string; created: number; updated: number; firstName: string; lastName: string; email: string; phone: string; }; expires: number; } }>;
};
