import { route } from "lib/route";
import { VideoCall } from "./VideoCall.model";
import { db } from "lib/db";
import { broadcastToConnections } from "lib/wsServer";

export default route(async function (params, body) {
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
            await handleSignalingMessage(videoCall, data);
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
            const { invalid } = broadcastToConnections(
                videoCall.connections,
                { type: 'videoCall', id: videoCall.id, message: { type, data } }
            );
            
            // Remove any invalid connections
            if (invalid.length > 0) {
                await removeInvalidConnectionsFromCall(videoCall, invalid);
            }
    }

    return { success: true };
}, { public: true })

// Helper function to remove invalid connections from a VideoCall
async function removeInvalidConnectionsFromCall(videoCall: VideoCall, invalidConnections: string[]) {
    console.log("invalid connections", invalidConnections)
    if (!invalidConnections.length) return;
    
    try {
        // Use a single query to atomically update the connections array
        await db.query`
            UPDATE entity
            SET data = jsonb_set(
                data,
                '{connections}',
                (
                    SELECT COALESCE(
                        (
                            SELECT jsonb_agg(conn)
                            FROM jsonb_array_elements_text(data->'connections') AS conn
                            WHERE NOT conn::text = ANY(${invalidConnections.map(c => JSON.stringify(c))})
                        ),
                        '[]'::jsonb
                    )
                )
            )
            WHERE kind = 'VideoCall'
            AND id = ${videoCall.id}
        `;
        
        // Update the in-memory object as well
        videoCall.connections = videoCall.connections.filter(
            conn => !invalidConnections.includes(conn)
        );
        
        // console.log(`Removed ${invalidConnections.length} invalid connections from VideoCall ${videoCall.id}`);
    } catch (error) {
        console.error(`Error removing invalid connections from VideoCall ${videoCall.id}:`, error);
    }
}

// Handle WebRTC signaling messages
async function handleSignalingMessage(videoCall: VideoCall, data: any) {
    // Extract the target connection ID from the data
    const { connectionId, targetConnectionId } = data;
    
    // Use targetConnectionId if provided, otherwise use connectionId
    const targetId = targetConnectionId || connectionId;

    // If no valid target, broadcast to all except sender
    if (!targetId || targetId === null) {
        // Send to all other connections except the sender
        const otherConnections = videoCall.connections.filter(conn => conn !== data.senderConnectionId);
        console.log("otherConnections", otherConnections)
        if (otherConnections.length > 0) {
            const { invalid } = broadcastToConnections(
                otherConnections,
                { type: 'videoCallSignal', ...data }
            );
            
            // Remove any invalid connections
            if (invalid.length > 0) {
                await removeInvalidConnectionsFromCall(videoCall, invalid);
            }
        }
        return;
    }
    
    // Send the signal only to the specified connection
    if (videoCall.connections.includes(targetId)) {
        const { invalid } = broadcastToConnections(
            [targetId],
            { type: 'videoCallSignal', ...data }
        );
        // Remove invalid connection if needed
        if (invalid.length > 0) {
            await removeInvalidConnectionsFromCall(videoCall, invalid);
        }
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
        const { invalid } = broadcastToConnections(
            videoCall.connections,
            {
                type: 'videoCallParticipant',
                event: 'joined',
                connectionId,
                totalParticipants: videoCall.connections.length
            }
        );
        console.log("broadcasting", "invalid", invalid, "all", videoCall.connections)
        
        // Remove any invalid connections
        if (invalid.length > 0) {
            await removeInvalidConnectionsFromCall(videoCall, invalid);
        }

        // Send signal to existing participants that a new peer has joined
        for (const existingConn of videoCall.connections) {
            if (existingConn !== connectionId) {
                const { invalid } = broadcastToConnections(
                    [existingConn],
                    {
                        type: 'videoCallSignal',
                        event: 'new-participant',
                        targetConnectionId: existingConn,
                        senderConnectionId: connectionId
                    }
                );
                
                // Process any invalid connections
                if (invalid.length > 0) {
                    await removeInvalidConnectionsFromCall(videoCall, invalid);
                }
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
        const { invalid } = broadcastToConnections(
            videoCall.connections,
            {
                type: 'videoCallParticipant',
                event: 'left',
                connectionId,
                totalParticipants: videoCall.connections.length
            }
        );
        
        // Remove any invalid connections
        if (invalid.length > 0) {
            await removeInvalidConnectionsFromCall(videoCall, invalid);
        }

        // Signal to all remaining participants that someone left
        for (const remainingConn of videoCall.connections) {
            const { invalid } = broadcastToConnections(
                [remainingConn],
                {
                    type: 'videoCallSignal',
                    event: 'participant-left',
                    connectionId
                }
            );
            
            // Process any invalid connections
            if (invalid.length > 0) {
                await removeInvalidConnectionsFromCall(videoCall, invalid);
            }
        }
    }
}
