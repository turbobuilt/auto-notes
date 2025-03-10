import { route } from "lib/route";
import { VideoCall } from "./VideoCall.model";
import { db } from "lib/db";

export default route(async function (params, connections: string[]) {
    let videoCall = new VideoCall();
    videoCall.connections = connections;
    await db.insert(videoCall);
    return { videoCall };
})