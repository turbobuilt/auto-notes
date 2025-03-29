import { db } from "./db";

export class VideoCallManager {
    private static instance: VideoCallManager;
    // Map of call ID to set of active connection IDs
    private callConnections: Map<string, Set<string>> = new Map();
    // Throttle database syncs with this map of callId -> last sync time
    private lastSyncTime: Map<string, number> = new Map();
    // Minimum time between database syncs for a call (3 seconds)
    private readonly SYNC_THROTTLE_MS = 3000;

    private constructor() { }

    public static getInstance(): VideoCallManager {
        if (!VideoCallManager.instance) {
            VideoCallManager.instance = new VideoCallManager();
        }
        return VideoCallManager.instance;
    }

    // Initialize the connection map from database
    public async initializeFromDatabase(callId: string): Promise<string[]> {
        try {
            const result = await db.query`
        SELECT data->'connections' as connections
        FROM entity
        WHERE kind = 'VideoCall' AND id = ${callId}
      `;

            if (result.length > 0 && result[0].connections) {
                const connections = result[0].connections.filter(
                    (conn: string | null) => conn !== null && conn !== undefined
                );

                // Initialize the set of connections
                this.callConnections.set(callId, new Set(connections));
                return connections;
            }

            return [];
        } catch (error) {
            console.error(`Error initializing connections for call ${callId}:`, error);
            return [];
        }
    }

    // Add connection to call
    public addConnection(callId: string, connectionId: string): void {
        if (!this.callConnections.has(callId)) {
            this.callConnections.set(callId, new Set());
        }
        this.callConnections.get(callId)!.add(connectionId);
    }

    // Remove connection from call
    public removeConnection(callId: string, connectionId: string): boolean {
        const connections = this.callConnections.get(callId);
        if (connections) {
            const result = connections.delete(connectionId);
            return result;
        }
        return false;
    }

    // Get all active connections for a call
    public getCallConnections(callId: string): string[] {
        const connections = this.callConnections.get(callId);
        return connections ? Array.from(connections) : [];
    }

    // Check if a connection is in a call
    public isConnectionInCall(callId: string, connectionId: string): boolean {
        const connections = this.callConnections.get(callId);
        return connections ? connections.has(connectionId) : false;
    }

    // Remove invalid connections from a call
    public removeInvalidConnections(callId: string, invalidConnections: string[]): void {
        const connections = this.callConnections.get(callId);
        if (connections && invalidConnections.length > 0) {
            for (const invalidConn of invalidConnections) {
                connections.delete(invalidConn);
            }
        }
    }

    // Sync the current connections to database (throttled)
    public async syncToDatabase(callId: string): Promise<void> {
        const now = Date.now();
        const lastSync = this.lastSyncTime.get(callId) || 0;

        // Only sync if enough time has passed since last sync
        if (now - lastSync >= this.SYNC_THROTTLE_MS) {
            const connections = this.getCallConnections(callId);

            try {
                await db.query`
          UPDATE entity
          SET data = jsonb_set(
            data, 
            '{connections}', 
            ${JSON.stringify(connections)}::jsonb
          )
          WHERE kind = 'VideoCall' AND id = ${callId}
        `;

                // Update last sync time
                this.lastSyncTime.set(callId, now);
            } catch (error) {
                console.error(`Error syncing connections for call ${callId}:`, error);
            }
        }
    }
}

// Export singleton instance
export const videoCallManager = VideoCallManager.getInstance();
