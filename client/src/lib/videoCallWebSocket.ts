import { getWebSocketService } from './websocketService';
import type { WebSocketService } from './websocketService';
import { serverMethods } from '../serverMethods';

// Type for video call WebSocket state
export interface VideoCallWebSocketState {
    videoCall: any;
    wsConnected: boolean;
    connectionId: string;
    events: Array<{ type: string, data: any, time: Date }>;
}

// Initialize WebSocket connection for video call
export async function initVideoCallWebSocket(connectionId: string, state: VideoCallWebSocketState) {
    try {
        // Get WebSocket service instance
        const wsService = getWebSocketService(connectionId);

        // Set up promise that resolves when connection is established
        const connectionPromise = new Promise<void>((resolve, reject) => {
            // Add event handlers
            wsService.on('connect', () => {
                state.wsConnected = true;
                state.events.push({
                    type: 'connection',
                    data: { status: 'connected' },
                    time: new Date()
                });
                resolve();
            });

            wsService.on('disconnect', (data) => {
                state.wsConnected = false;
                state.events.push({
                    type: 'connection',
                    data: { status: 'disconnected', ...data },
                    time: new Date()
                });
            });

            // Set timeout to prevent hanging
            setTimeout(() => reject(new Error('Connection timeout')), 10000);
        });

        // Connect to WebSocket server
        await wsService.connect();
        
        // Wait for the connection to be established
        await connectionPromise;

        return wsService;
    } catch (error) {
        console.error('Error initializing video call WebSocket:', error);
        throw error;
    }
}

// Function to join a video call
export async function joinVideoCall(wsService: WebSocketService, videoCallId: string, connectionId: string) {
    try {
        // Join the call using WebSocket method call
        console.log('Joining video call:', videoCallId, connectionId);
        const result = await wsService.callMethod('videoCall.join', videoCallId, connectionId);
        return result;
    } catch (error) {
        console.error('Error joining video call:', error);
        throw error;
    }
}

// Send a message for a video call
export async function sendVideoCallMessage(
    wsService: WebSocketService,
    wsConnected: boolean,
    callId: string,
    type: string,
    data: any
) {
    if (!wsConnected) {
        throw new Error('WebSocket not connected');
    }

    try {
        return await wsService.callMethod('videoCall.message', {
            callId,
            type,
            data
        });
    } catch (error) {
        console.error(`Error sending ${type} message:`, error);
        throw error;
    }
}
