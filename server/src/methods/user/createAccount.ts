import { route } from "lib/route";
import { User } from "./user.model";
import bcrypt from "bcryptjs";
import { db } from "lib/db";
import { hashPassword } from "./util";
import { createToken } from "./login";

export default route(async function (params, { email, password }) {
    // Create account
    let user = new User();
    user.email = email;
    user.passwordHash = await hashPassword(password);
    await db.insert(user);
    delete user.passwordHash;

    let authToken = await createToken(user);
    return { user, authToken: authToken.authToken, expires: authToken.expires };
}, {
    public: true
});