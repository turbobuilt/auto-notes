import callMethod from "../../lib/callMethod";

export default function login({ email, password }) {
    return callMethod("user.login", [...arguments]) as Promise<{ error?: string, data: { authToken: string; user: any; expires: number; } }>;
};
