import { DbObject } from "lib/dbObject";

export class AuthToken extends DbObject {
    user: string;
    authToken: string;
    expires: number;
}