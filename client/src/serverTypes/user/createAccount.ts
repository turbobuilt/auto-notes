import callMethod from "../../lib/callMethod";
import { User } from "./user.model";

export default function createAccount({ email, password }) {
    return callMethod("user.createAccount", [...arguments]) as Promise<{ error?: string, data: { user: import("/Users/me/prj/autotherapynotes/server/src/methods/user/user.model").User; authToken: string; expires: number; } }>;
};
