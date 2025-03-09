import { route } from "lib/route";
import { User } from "./user.model";
import bcrypt from "bcryptjs";
import { db } from "lib/db";
import { DbObject } from "lib/dbObject";
import { promisify } from "util";
import { sendEmail } from "lib/sendEmail";
import { hashPassword, validatePassword } from "./util";
import { AuthToken } from "./authToken.model";
import bs58 from 'bs58'

const randomBytes = promisify(require('crypto').randomBytes);


export default route(async function(params, { email, password }) {

    let [user] = await db.find(User, { email });
    if (!user) {
        throw new Error('User not found');
    }
    if (!await validatePassword(password, user.passwordHash)) {
        throw new Error('Invalid password');
    }
    let authToken = await createToken(user);

    return { authToken: authToken.authToken, user: user.id, expires: authToken.expires }
}, { public: true });

export async function createToken(user) {

    let authToken = new AuthToken();
    authToken.user = user.id;
    authToken.expires = null;
    authToken.authToken = await randomBytes(16).then(buf => bs58.encode(buf));
    await db.insert(authToken);
    return authToken;
}