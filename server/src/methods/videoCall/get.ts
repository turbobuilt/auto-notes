import { route } from "lib/route";
import { VideoCall } from "./VideoCall.model";
import { db } from "lib/db";

export default route(async function (params, id: string, connectionId: string) {
    // entity.id = id entity.data->>connections - need to push the currenc connectionId on in one fell swoop before fetching

    let [videoCall] = await db.find(VideoCall, { id });
    videoCall.connections.push(connectionId);
    await db.update(videoCall);
    return { videoCall };
}, { public: true });