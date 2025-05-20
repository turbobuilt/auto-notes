import { db } from "lib/db";
import { route } from "lib/route";
import { videoCallManager } from "lib/VideoCallManager";
import { broadcastToConnections } from "lib/wsServer";
import { VideoCall } from "./VideoCall.model";

export default route(async function (params, callId: string, connectionId: string) {
    console.log("leave", callId, connectionId);
    
    // Get the video call to check for owner and get current connections
    const [videoCall] = await db.find(VideoCall, { id: callId });
    if (!videoCall) {
        console.error(`Video call ${callId} not found`);
        return { success: false, error: "Video call not found" };
    }
    
    // Get remaining connections before removing the current one
    const remainingConnections = videoCallManager.getCallConnections(callId).filter(conn => conn !== connectionId);
    
    // Remove the connection from the video call manager
    videoCallManager.removeConnection(callId, connectionId);
    
    // Update the database
    await db.queryParameters(`UPDATE entity
SET data = jsonb_set(
    data,
    '{connections}',
    (data->'connections') - ?
) WHERE kind='VideoCall' AND id=?`, [connectionId, callId]);

    // Check if there are remaining participants
    if (remainingConnections.length > 0) {
        // Notify all remaining participants that this user left
        const { invalid } = broadcastToConnections(
            remainingConnections,
            {
                type: 'videoCallParticipant',
                event: 'left',
                connectionId,
                totalParticipants: remainingConnections.length,
                isOwner: videoCall.creator === connectionId
            }
        );
        
        // Remove any invalid connections
        if (invalid.length > 0) {
            videoCallManager.removeInvalidConnections(callId, invalid);
            await videoCallManager.syncToDatabase(callId);
        }
        
        // Also send a more specific signal for WebRTC cleanup
        for (const remainingConn of remainingConnections) {
            broadcastToConnections(
                [remainingConn],
                {
                    type: 'participant-left',
                    connectionId
                }
            );
        }
    }

    return { success: true }
}, { keepAlive: true, public: true });