import { route } from "lib/route";
import { User } from "./user.model";
import bcrypt from "bcryptjs";
import { db } from "lib/db";
import { DbObject } from "lib/dbObject";
import { promisify } from "util";
import { sendEmail } from "lib/sendEmail";

export class ResetPasswordToken extends DbObject {
    user: string;
    authToken: string;
    expires: number;
}

const randomBytes = promisify(require('crypto').randomBytes);

export default route(async function(params) {
    let { email } = params.body;

    let [user] = await db.find('user', { email });

    if (!user) {
        throw new Error('User not found');
    }

    // Generate reset authToken
    let resetToken = await randomBytes(32).then(buf => buf.toString('hex'));
    let resetPasswordToken = new ResetPasswordToken();
    resetPasswordToken.user = user.id;
    resetPasswordToken.authToken = resetToken;
    resetPasswordToken.expires = Date.now() + 1000 * 60 * 60 * 24; // 24 hours
    await db.insert(resetPasswordToken);

    await sendEmail({
        to: user.email,
        from: "security@" + process.env.domain,
        subject: 'Reset your password',
        html: `
            <p>Hello ${user.firstName},</p>
            <p>Click <a href="${process.env.base_url}/reset-password/${resetToken}">here</a> to reset your password.</p>
        `
    });

    return { success: true }
});

