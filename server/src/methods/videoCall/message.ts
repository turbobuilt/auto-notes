import { route } from "lib/route";
import { VideoCall } from "./VideoCall.model";
import { db } from "lib/db";
import { broadcastToConnections } from "lib/wsServer";

export default route(async function (params, body) {
    console.log("body is", body);
    const { callId, type, data } = body;

    // Retrieve the video call
    const [videoCall] = await db.find(VideoCall, { id: callId });
    if (!videoCall) {
        throw new Error("Video call not found");
    }

    // Filter out any null or undefined connections
    videoCall.connections = videoCall.connections.filter(conn => conn !== null && conn !== undefined);

    // Handle the message based on type
    switch (type) {
        case 'signal':
            // For signaling, just forward the message to the intended recipient
            handleSignalingMessage(videoCall, data);
            break;

        case 'join':
            // Handle participant joining
            await handleJoinMessage(videoCall, data);
            break;

        case 'leave':
            // Handle participant leaving
            await handleLeaveMessage(videoCall, data);
            break;

        default:
            // For other messages, just broadcast to all participants
            broadcastToConnections(
                videoCall.connections,
                { type: 'videoCall', id: videoCall.id, message: { type, data } }
            );
    }

    return { success: true };
})

// Handle WebRTC signaling messages
function handleSignalingMessage(videoCall: VideoCall, data: any) {
    // Extract the target connection ID from the data
    const { connectionId, targetConnectionId } = data;
    
    // Use targetConnectionId if provided, otherwise use connectionId
    const targetId = targetConnectionId || connectionId;

    // If no valid target, broadcast to all except sender
    if (!targetId || targetId === null) {
        // Send to all other connections except the sender
        const otherConnections = videoCall.connections.filter(conn => conn !== data.senderConnectionId);
        if (otherConnections.length > 0) {
            broadcastToConnections(
                otherConnections,
                { type: 'videoCallSignal', ...data }
            );
        }
        return;
    }
    
    // Send the signal only to the specified connection
    if (videoCall.connections.includes(targetId)) {
        broadcastToConnections(
            [targetId],
            { type: 'videoCallSignal', ...data }
        );
    }
}

// Handle participant join
async function handleJoinMessage(videoCall: VideoCall, data: any) {
    const { connectionId } = data;

    if (!connectionId) return;

    // Check if this connection is already in the call
    if (!videoCall.connections.includes(connectionId)) {
        // Add the connection to the video call
        videoCall.connections.push(connectionId);
        await db.update(videoCall);

        // Notify all participants about the new connection
        broadcastToConnections(
            videoCall.connections,
            {
                type: 'videoCallParticipant',
                event: 'joined',
                connectionId,
                totalParticipants: videoCall.connections.length
            }
        );

        // Send signal to existing participants that a new peer has joined
        for (const existingConn of videoCall.connections) {
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
    }
}

// Handle participant leave
async function handleLeaveMessage(videoCall: VideoCall, data: any) {
    const { connectionId } = data;

    // Remove the connection from the video call
    const index = videoCall.connections.indexOf(connectionId);
    if (index !== -1) {
        videoCall.connections.splice(index, 1);
        await db.update(videoCall);

        // Notify remaining participants
        broadcastToConnections(
            videoCall.connections,
            {
                type: 'videoCallParticipant',
                event: 'left',
                connectionId,
                totalParticipants: videoCall.connections.length
            }
        );

        // Signal to all remaining participants that someone left
        for (const remainingConn of videoCall.connections) {
            broadcastToConnections(
                [remainingConn],
                {
                    type: 'videoCallSignal',
                    type: 'participant-left',
                    connectionId
                }
            );
        }
    }
}
