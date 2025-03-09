import { route } from "lib/route";
import { User } from "./user.model";
import bcrypt from "bcryptjs";
import { db } from "lib/db";
import { DbObject } from "lib/dbObject";
import { promisify } from "util";
import { sendEmail } from "lib/sendEmail";
import { hashPassword } from "./util";

export class ResetPasswordToken extends DbObject {
    user: string;
    authToken: string;
    expires: number;
}

const randomBytes = promisify(require('crypto').randomBytes);

export default route(async function(params) {
    let { authToken, password } = params.body;

    let [resetPasswordToken] = await db.find(ResetPasswordToken, { authToken });

    if (!resetPasswordToken) {
        throw new Error('Invalid authToken');
    }

    if (resetPasswordToken.expires < Date.now()) {
        throw new Error('Token expired');
    }

    let [user] = await db.find('User', { id: resetPasswordToken.user });

    if (!user) {
        throw new Error('User not found');
    }

    user.passwordHash = await hashPassword(password);
    await db.update('User', user);

    await db.delete('ResetPasswordToken', resetPasswordToken.id);

    return { success: true }
});

