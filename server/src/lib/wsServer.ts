import { WebSocketServer, WebSocket } from 'ws';
import { db } from './db';
import { parse } from 'url';

// Connection tracking
interface WSConnection {
    ws: WebSocket;
    connectionId: string;
    userId?: string;
    lastPing: number;
}

// Store active connections
export const activeWebSocketConnections = new Map<string, WSConnection>();

// Periodic cleanup interval (5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

export function setupWebSocketServer(wss: WebSocketServer) {
    // Setup connection handler
    wss.on('connection', async (ws, req) => {
        const url = parse(req.url || '', true);
        const connectionId = url.query.connectionId as string;
        
        if (!connectionId) {
            ws.close(1008, 'Connection ID required');
            return;
        }
        
        // Extract auth token from query or headers
        const authToken = (url.query.token as string) || 
                        (req.headers.authorization as string) || 
                        (req.headers['sec-websocket-protocol'] as string);
        
        // Try to find user by token if provided
        let userId: string | undefined;
        if (authToken) {
            try {
                const [user] = await db.query`
                    SELECT "entity".* FROM "entity"
                    WHERE kind='User' AND id = (
                        SELECT entity.data->>'user' 
                        FROM entity 
                        WHERE entity.data->>'authToken' = ${authToken} 
                        AND entity.kind = 'AuthToken'
                    )`;
                
                if (user) {
                    userId = user.id;
                }
            } catch (error) {
                console.error('Error authenticating WebSocket connection:', error);
            }
        }
        
        // Store the connection
        activeWebSocketConnections.set(connectionId, {
            ws,
            connectionId,
            userId,
            lastPing: Date.now()
        });
        
        console.log(`WebSocket connected: ${connectionId}${userId ? ` (User: ${userId})` : ''}`);
        
        // Setup ping to keep connection alive
        const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            } else {
                clearInterval(pingInterval);
            }
        }, 30000);
        
        // Handle incoming messages
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());
                
                // Handle ping messages to keep connection alive
                if (data.type === 'ping') {
                    const conn = activeWebSocketConnections.get(connectionId);
                    if (conn) {
                        conn.lastPing = Date.now();
                        ws.send(JSON.stringify({ type: 'pong' }));
                    }
                    return;
                }
                
                // Handle method calls
                if (data.method) {
                    handleWebSocketMethod(ws, data, userId);
                }
            } catch (error) {
                console.error('Error handling WebSocket message:', error);
                ws.send(JSON.stringify({ 
                    error: 'Invalid message format',
                    details: error.message 
                }));
            }
        });
        
        // Handle connection close
        ws.on('close', () => {
            activeWebSocketConnections.delete(connectionId);
            clearInterval(pingInterval);
            console.log(`WebSocket disconnected: ${connectionId}`);
        });
    });
    
    // Setup periodic cleanup of stale connections
    setInterval(cleanupConnections, CLEANUP_INTERVAL);
}

// Cleanup stale connections
function cleanupConnections() {
    const now = Date.now();
    const staleThreshold = now - CLEANUP_INTERVAL;
    
    for (const [id, conn] of activeWebSocketConnections.entries()) {
        // Check if connection is stale
        if (conn.lastPing < staleThreshold) {
            // Close the connection if it's still open
            if (conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.close(1000, 'Connection timeout');
            }
            activeWebSocketConnections.delete(id);
            console.log(`Cleaned up stale WebSocket: ${id}`);
        }
    }
}

// Handle method calls via WebSocket
async function handleWebSocketMethod(ws: WebSocket, data: any, userId?: string) {
    try {
        // Import the method dynamically
        const methodParts = data.method.split('.');
        const methodPath = `../methods/${methodParts.join('/')}`;
        
        let methodModule;
        try {
            methodModule = await import(methodPath);
        } catch (error) {
            ws.send(JSON.stringify({ 
                id: data.id,
                error: `Method ${data.method} not found` 
            }));
            return;
        }
        
        const { handler, options } = methodModule.default;
        
        // Check authentication unless public
        if (!options.public && !userId) {
            ws.send(JSON.stringify({ 
                id: data.id,
                error: "Authentication required" 
            }));
            return;
        }
        
        // Create fake route parameters for handler
        const routeParams = {
            user: userId ? { id: userId } : null,
            isWeb: true,
            isIosApp: false,
            isAndroidApp: false,
            requestIp: '',
            body: data.params || {}
        };
        
        // Execute method
        const result = await handler(routeParams, ...(data.args || []));
        
        // Send result back
        ws.send(JSON.stringify({ 
            id: data.id,
            result 
        }));
        
    } catch (error) {
        console.error('Error handling WebSocket method call:', error);
        ws.send(JSON.stringify({ 
            id: data.id,
            error: "Internal server error", 
            details: error.message 
        }));
    }
}

// Broadcast to a specific connection
export function broadcastToConnection(connectionId: string, data: any): boolean {
    const conn = activeWebSocketConnections.get(connectionId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify(data));
        return true;
    }
    return false;
}

// Broadcast to multiple connections
export function broadcastToConnections(connectionIds: string[], data: any): {
    successful: string[];
    invalid: string[];
} {
    const successful: string[] = [];
    const invalid: string[] = [];
    
    for (const id of connectionIds) {
        const conn = activeWebSocketConnections.get(id);
        if (conn && conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.send(JSON.stringify(data));
            successful.push(id);
        } else {
            invalid.push(id);
        }
    }
    
    return { successful, invalid };
}

// Broadcast to all connections for a user
export function broadcastToUser(userId: string, data: any): number {
    let count = 0;
    
    for (const conn of activeWebSocketConnections.values()) {
        if (conn.userId === userId && conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.send(JSON.stringify(data));
            count++;
        }
    }
    
    return count;
}
