import { DbObject } from "lib/dbObject";

export class User{
    id: string;
    created: number;
    updated: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    passwordHash: string;
}

export function getUserForClient(user: User) {
    let userForClient = {} as any;
    Object.assign(userForClient, user);
    delete userForClient.passwordHash;
    return userForClient;
}