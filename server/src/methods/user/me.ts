import { db } from "lib/db";
import { route } from "lib/route";
import { getUserForClient } from "./user.model";

export default route(async function (params) {
    let [user] = await db.find('user', { id: params.user.id });

    return { user: getUserForClient(user) };
});