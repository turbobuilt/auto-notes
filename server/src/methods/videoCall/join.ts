import { route } from "lib/route";
import { VideoCall } from "./VideoCall.model";
import { db } from "lib/db";
import { videoCallManager } from "lib/VideoCallManager";
import { broadcastToConnections } from "lib/wsServer";

export default route(async function (params, callId: string, connectionId: string) {
    // Check if the call exists
    const [videoCall] = await db.find(VideoCall, { id: callId });
    if (!videoCall) {
        throw new Error("Video call not found");
    }
    
    // Initialize connection tracking if needed
    await videoCallManager.initializeFromDatabase(callId);
    
    // Add the connection to the call
    videoCallManager.addConnection(callId, connectionId);
    
    // Sync to database
    await videoCallManager.syncToDatabase(callId);
    
    // Get all active connections
    const connections = videoCallManager.getCallConnections(callId);
    
    // Notify all participants about the new connection
    const { invalid } = broadcastToConnections(
        connections,
        {
            type: 'videoCallParticipant',
            event: 'joined',
            connectionId,
            totalParticipants: connections.length
        }
    );
    
    // Remove any invalid connections
    if (invalid.length > 0) {
        videoCallManager.removeInvalidConnections(callId, invalid);
        await videoCallManager.syncToDatabase(callId);
    }

    // Send signals to existing participants that a new peer has joined
    for (const existingConn of connections) {
        if (existingConn !== connectionId) {
            broadcastToConnections(
                [existingConn],
                {
                    type: 'videoCallSignal',
                    event: 'new-participant',
                    targetConnectionId: existingConn,
                    senderConnectionId: connectionId
                }
            );
        }
    }
    
    return { videoCall, activeConnections: connections };
}, { public: true });
