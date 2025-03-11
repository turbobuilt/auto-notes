import { route } from "lib/route";
import { VideoCall } from "./VideoCall.model";
import { db } from "lib/db";
import { videoCallManager } from "lib/VideoCallManager";

export default route(async function (params, connections: string[]) {
    // Filter out null connections
    connections = connections.filter(conn => conn !== null && conn !== undefined);
    
    // Create new video call
    let videoCall = new VideoCall();
    videoCall.connections = connections;
    await db.insert(videoCall);
    
    // Initialize the manager with these connections
    for (const conn of connections) {
        videoCallManager.addConnection(videoCall.id, conn);
    }
    
    return { videoCall };
})