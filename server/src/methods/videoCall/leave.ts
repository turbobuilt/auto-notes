import { db } from "lib/db";
import { route } from "lib/route";

export default route(async function (params, callId: string, connectionId: string) {
    console.log("leave", callId, connectionId);
    await db.queryParameters(`UPDATE entity
SET data = jsonb_set(
    data,
    '{connections}',
    (data->'connections') - ?
) WHERE kind='VideoCall' AND id=?`, [connectionId, callId]);
    return { success: true }
}, { keepAlive: true, public: true });