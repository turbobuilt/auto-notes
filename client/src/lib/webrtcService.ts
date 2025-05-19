export interface PeerConnection {
    connection: RTCPeerConnection;
    remoteStream: MediaStream;
    connectionId: string;
    isInitiator: boolean;
    connected: boolean;
    lastActivity: number; // Add timestamp for last activity
    status: 'active' | 'stale' | 'dead'; // Add connection status
}

// Add new EventCallback type for the event system
type EventCallback = (...args: any[]) => void;

export class WebRTCService {
    // Change access modifiers to public to avoid proxy interference
    public peerConnections: Map<string, PeerConnection> = new Map();
    public localStream: MediaStream | null;
    private originalStream: MediaStream | null = null; // For storing original camera stream during screen sharing
    public rtcConfig: RTCConfiguration = {
        iceServers: [
            { urls: 'stun:stun.stunprotocol.org:3478' },
            { urls: 'stun:stun.l.google.com:19302' },
        ]
    };
    public onSignalNeededCallback: (signal: any) => void;
    public onRemoteStreamAddedCallback: ((connectionId: string, stream: MediaStream) => void) | null = null;
    public onConnectionStatusChangedCallback: ((connectionId: string, status: 'active' | 'stale' | 'dead') => void) | null = null;

    private connectionMonitorInterval: number | null = null;
    private readonly STALE_THRESHOLD_MS = 1000; // 5 seconds for stale
    private readonly DEAD_THRESHOLD_MS = 5000; // 15 seconds for dead

    // Add event system
    private eventListeners: Map<string, Set<EventCallback>> = new Map();

    constructor(onSignalNeeded: (signal: any) => void) {
        this.onSignalNeededCallback = onSignalNeeded;
        this.localStream = null;
        console.log("WebRTCService initialized with localStream:", this.localStream);

        // Start connection monitor
        this.startConnectionMonitor();
        
        // Initialize event maps for common events
        this.eventListeners.set('remoteStreamAdded', new Set());
        this.eventListeners.set('remoteStreamRemoved', new Set());
        this.eventListeners.set('connectionStatusChanged', new Set());
        this.eventListeners.set('localStreamChanged', new Set());
    }

    // Set callback for signaling
    setSignalCallback(callback: (signal: any) => void): void {
        this.onSignalNeededCallback = callback;
    }

    // Set callback for connection status changes
    setOnConnectionStatusChanged(callback: (connectionId: string, status: 'active' | 'stale' | 'dead') => void): void {
        this.onConnectionStatusChangedCallback = callback;
        // Also register with event system
        this.on('connectionStatusChanged', callback);
    }

    // Set callback for remote stream events
    setOnRemoteStreamAdded(callback: (connectionId: string, stream: MediaStream) => void): void {
        this.onRemoteStreamAddedCallback = callback;
        // Also register with event system for consistency
        this.on('remoteStreamAdded', callback);
    }

    // Get local media stream with defensive programming
    async startLocalStream(videoEnabled = true, audioEnabled = true): Promise<MediaStream> {
        console.log("getLocalStream called", this, this.localStream);

        // Return existing stream if available
        if (this.localStream) {
            console.log("Returning existing stream");
            return this.localStream;
        }

        try {
            console.log("Requesting user media...");
            const stream = await navigator.mediaDevices.getUserMedia({
                video: videoEnabled,
                audio: audioEnabled
            });
            console.log("Got media stream:", stream);

            this.localStream = stream;
            
            // Emit event for local stream change
            this.emit('localStreamChanged', stream);
            
            return stream;
        } catch (error) {
            console.error('Error accessing media devices:', error);
            throw error;
        }
    }

    // Initialize a peer connection
    async createPeerConnection(connectionId: string, isInitiator: boolean): Promise<PeerConnection> {
        // Check if we already have this connection
        if (this.peerConnections.has(connectionId)) {
            console.log(`Connection to ${connectionId} already exists`);
            return this.peerConnections.get(connectionId)!;
        }

        console.log(`Creating new connection to ${connectionId}, isInitiator: ${isInitiator}`);

        // Create RTCPeerConnection
        const peerConnection = new RTCPeerConnection(this.rtcConfig);
        const remoteStream = new MediaStream();

        // Ensure we have local stream
        // if not device has no webcam, keep going as the other user might.
        if (!this.localStream) {
            try {
                await this.startLocalStream();
            } catch (e) {
                console.warn('Failed to get local stream:', e);
                // Continue without local stream
            }
        }

        // Add all local tracks to the connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                console.log(`Adding local track to connection ${connectionId}:`, track);
                peerConnection.addTrack(track, this.localStream!);
            });
        } else {
            console.warn('No local stream available when creating peer connection');
        }

        // Handle incoming tracks
        peerConnection.ontrack = event => {
            console.log(`Remote track received from ${connectionId}:`, event);

            event.streams[0].getTracks().forEach(track => {
                console.log(`Adding remote track to stream for ${connectionId}:`, track);
                remoteStream.addTrack(track);
            });

            // Update last activity timestamp
            this.updateConnectionActivity(connectionId);

            // Emit event via event system in addition to callback
            this.emit('remoteStreamAdded', connectionId, remoteStream);
            
            // Notify via callback if available
            if (this.onRemoteStreamAddedCallback) {
                console.log(`Calling onRemoteStreamAdded for ${connectionId}`);
                this.onRemoteStreamAddedCallback(connectionId, remoteStream);
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                console.log(`ICE candidate generated for ${connectionId}:`, event.candidate);
                this.onSignalNeededCallback({
                    type: 'ice-candidate',
                    connectionId,
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log(`Connection state for ${connectionId}: ${peerConnection.connectionState}`);
            const peer = this.peerConnections.get(connectionId);
            if (peer) {
                peer.connected = peerConnection.connectionState === 'connected';

                // Update last activity timestamp on connection state change
                if (peer.connected) {
                    this.updateConnectionActivity(connectionId);
                }
            }
        };

        // Handle ICE connection state
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`ICE connection state for ${connectionId}: ${peerConnection.iceConnectionState}`);

            // Update activity on favorable ICE state changes
            if (['connected', 'completed'].includes(peerConnection.iceConnectionState)) {
                this.updateConnectionActivity(connectionId);
            }
        };

        // Handle data channel for activity tracking
        const dataChannel = peerConnection.createDataChannel('keepalive', { negotiated: true, id: 100 });
        dataChannel.onmessage = () => {
            this.updateConnectionActivity(connectionId);
        };

        // Send keepalive ping every 2 seconds
        setInterval(() => {
            try {
                if (dataChannel.readyState === 'open') {
                    dataChannel.send('ping');
                }
            } catch (err) {
                console.warn(`Error sending keepalive to ${connectionId}:`, err);
            }
        }, 2000);

        // Create a new peer connection object
        const peer: PeerConnection = {
            connection: peerConnection,
            remoteStream,
            connectionId,
            isInitiator,
            connected: false,
            lastActivity: Date.now(),
            status: 'active'
        };

        this.peerConnections.set(connectionId, peer);

        // If we're the initiator, create and send an offer
        if (isInitiator) {
            console.log(`Creating offer as initiator for ${connectionId}`);
            await this.createAndSendOffer(connectionId);
        }

        return peer;
    }

    // Create and send an offer to a peer
    async createAndSendOffer(connectionId: string): Promise<void> {
        console.log("Sending offer")
        const peer = this.peerConnections.get(connectionId);
        if (!peer) throw new Error(`No peer connection for ID: ${connectionId}`);

        try {
            console.log(`Creating offer for ${connectionId}`);
            const offer = await peer.connection.createOffer();
            console.log(`Setting local description for ${connectionId}:`, offer);
            await peer.connection.setLocalDescription(offer);

            this.onSignalNeededCallback({
                type: 'offer',
                connectionId,
                sdp: peer.connection.localDescription
            });
        } catch (error) {
            console.error(`Error creating offer for ${connectionId}:`, error);
            throw error;
        }
    }

    // Handle incoming SDP offer
    async handleOffer(connectionId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
        console.log(`Handling offer from ${connectionId}:`, sdp);

        let peer = this.peerConnections.get(connectionId);

        // If no connection exists yet, create one
        if (!peer) {
            console.log(`No existing connection for ${connectionId}, creating new one`);
            peer = await this.createPeerConnection(connectionId, false);
        }

        try {
            console.log(`Setting remote description for ${connectionId}`);
            await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));

            console.log(`Creating answer for ${connectionId}`);
            const answer = await peer.connection.createAnswer();

            console.log(`Setting local description for ${connectionId}:`, answer);
            await peer.connection.setLocalDescription(answer);

            this.onSignalNeededCallback({
                type: 'answer',
                connectionId,
                sdp: peer.connection.localDescription
            });
        } catch (error) {
            console.error(`Error handling offer from ${connectionId}:`, error);
            throw error;
        }
    }

    // Handle incoming SDP answer
    async handleAnswer(connectionId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
        const peer = this.peerConnections.get(connectionId);
        if (!peer) throw new Error(`No peer connection for ID: ${connectionId}`);

        try {
            await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (error) {
            console.error('Error handling answer:', error);
            throw error;
        }
    }

    // Handle incoming ICE candidate
    async handleIceCandidate(connectionId: string, candidate: RTCIceCandidateInit): Promise<void> {
        const peer = this.peerConnections.get(connectionId);
        if (!peer) throw new Error(`No peer connection for ID: ${connectionId}`);

        try {
            await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
            throw error;
        }
    }

    // Get all active connections
    getConnections(): PeerConnection[] {
        return Array.from(this.peerConnections.values());
    }

    // Get specific connection
    getConnection(connectionId: string): PeerConnection | undefined {
        return this.peerConnections.get(connectionId);
    }

    // Toggle local audio
    toggleAudio(enabled: boolean): void {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = enabled;
            });
        }
    }

    // Toggle local video
    toggleVideo(enabled: boolean): void {
        if (this.localStream) {
            this.localStream.getVideoTracks().forEach(track => {
                track.enabled = enabled;
            });
        }
    }

    // Start screen sharing
    async startScreenSharing(): Promise<boolean> {
        try {
            if (!this.localStream) {
                console.warn('Cannot start screen sharing: No local stream exists');
                return false;
            }

            // Save original stream for later
            this.originalStream = this.localStream;

            // Get screen share stream
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true
            });

            // Update local stream reference
            this.localStream = screenStream;

            // Replace tracks in all peer connections
            const videoTrack = screenStream.getVideoTracks()[0];
            if (videoTrack) {
                const connections = this.getConnections();
                for (const conn of connections) {
                    const senders = conn.connection.getSenders();
                    const sender = senders.find(s => s.track && s.track.kind === 'video');
                    if (sender) {
                        await sender.replaceTrack(videoTrack);
                    }
                }
            }

            return true;
        } catch (error) {
            console.error('Error starting screen share:', error);
            throw error;
        }
    }

    // Stop screen sharing
    async stopScreenSharing(): Promise<boolean> {
        try {
            if (!this.originalStream || !this.localStream) {
                console.warn('Cannot stop screen sharing: No original stream to restore');
                return false;
            }

            // Stop all tracks in screen sharing stream
            this.localStream.getTracks().forEach(track => track.stop());

            // Restore original stream
            this.localStream = this.originalStream;
            this.originalStream = null;

            // Replace tracks in all peer connections
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                const connections = this.getConnections();
                for (const conn of connections) {
                    const senders = conn.connection.getSenders();
                    const sender = senders.find(s => s.track && s.track.kind === 'video');
                    if (sender) {
                        await sender.replaceTrack(videoTrack);
                    }
                }
            }

            return true;
        } catch (error) {
            console.error('Error stopping screen share:', error);
            throw error;
        }
    }

    // Clean up and close all connections
    closeAllConnections(): void {
        this.stopConnectionMonitor();

        this.peerConnections.forEach(peer => {
            peer.connection.close();
        });

        this.peerConnections.clear();

        // Stop screen sharing if active
        if (this.originalStream) {
            this.stopScreenSharing().catch(console.error);
        }

        // Stop all tracks in the local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
            });
            this.localStream = null;
        }
    }

    // Close a specific connection
    closeConnection(connectionId: string): void {
        const peer = this.peerConnections.get(connectionId);
        if (peer) {
            // Before closing, emit a remote stream removed event if there was a stream
            if (peer.remoteStream && peer.remoteStream.getTracks().length > 0) {
                this.emit('remoteStreamRemoved', connectionId, peer.remoteStream);
            }
            
            peer.connection.close();
            this.peerConnections.delete(connectionId);
        }
    }

    // Get active connections with remote streams
    getConnectionsWithRemoteStreams(): PeerConnection[] {
        return Array.from(this.peerConnections.values()).filter(
            conn => conn.remoteStream && conn.remoteStream.getTracks().length > 0
        );
    }

    // Start monitoring connections
    private startConnectionMonitor(): void {
        // Clear any existing interval
        if (this.connectionMonitorInterval !== null) {
            window.clearInterval(this.connectionMonitorInterval);
        }

        // Check connections every second
        this.connectionMonitorInterval = window.setInterval(() => {
            this.checkConnectionHealth();
        }, 1000);
    }

    // Stop monitoring connections
    private stopConnectionMonitor(): void {
        if (this.connectionMonitorInterval !== null) {
            window.clearInterval(this.connectionMonitorInterval);
            this.connectionMonitorInterval = null;
        }
    }

    // Update connection activity timestamp
    updateConnectionActivity(connectionId: string): void {
        const peer = this.peerConnections.get(connectionId);
        if (peer) {
            const previousStatus = peer.status;

            // Update timestamp
            peer.lastActivity = Date.now();

            // If previously stale or dead, mark as active again
            if (peer.status !== 'active') {
                peer.status = 'active';

                // Emit event
                this.emit('connectionStatusChanged', connectionId, 'active');
                
                // Original callback is still used for backward compatibility
                if (this.onConnectionStatusChangedCallback && previousStatus !== 'active') {
                    this.onConnectionStatusChangedCallback(connectionId, 'active');
                }

                console.log(`Connection ${connectionId} is now active again`);
            }
        }
    }

    // Check health of all connections
    private checkConnectionHealth(): void {
        const now = Date.now();

        this.peerConnections.forEach((peer, connectionId) => {
            const timeSinceActivity = now - peer.lastActivity;
            const previousStatus = peer.status;
            let statusChanged = false;

            // Check for stale connections (5+ seconds without activity)
            if (timeSinceActivity >= this.STALE_THRESHOLD_MS && peer.status === 'active') {
                peer.status = 'stale';
                statusChanged = true;
                console.log(`Connection ${connectionId} is stale (${timeSinceActivity}ms without activity)`);
            }
            // Check for dead connections (15+ seconds without activity)
            else if (timeSinceActivity >= this.DEAD_THRESHOLD_MS && peer.status === 'stale') {
                // peer.status = 'dead';
                // statusChanged = true;
                // console.log(`Connection ${connectionId} is dead (${timeSinceActivity}ms without activity)`);
                
                // delete connection if dead
                console.log("Connection is dead, closing connection", connectionId);
                this.closeConnection(connectionId);
                return;
            }

            // Notify about status changes
            if (statusChanged) {
                // Emit event
                this.emit('connectionStatusChanged', connectionId, peer.status);
                
                // Use callback for backward compatibility
                if (this.onConnectionStatusChangedCallback) {
                    this.onConnectionStatusChangedCallback(connectionId, peer.status);
                }
            }
        });
    }

    // Event handling methods
    public on(eventName: string, callback: EventCallback): void {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, new Set());
        }
        this.eventListeners.get(eventName)!.add(callback);
    }
    
    public off(eventName: string, callback: EventCallback): void {
        if (this.eventListeners.has(eventName)) {
            this.eventListeners.get(eventName)!.delete(callback);
        }
    }
    
    private emit(eventName: string, ...args: any[]): void {
        if (this.eventListeners.has(eventName)) {
            this.eventListeners.get(eventName)!.forEach(callback => {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`Error in ${eventName} event handler:`, error);
                }
            });
        }
    }

    // Monitor stream changes for recording
    public onStreamChanged(callback: (stream: MediaStream, type: 'added' | 'removed', connectionId?: string) => void): void {
        // Register for local stream changes
        this.on('localStreamChanged', (stream: MediaStream) => {
            callback(stream, 'added');
        });
        
        // Register for remote stream additions
        this.on('remoteStreamAdded', (connectionId: string, stream: MediaStream) => {
            callback(stream, 'added', connectionId);
        });
        
        // Register for remote stream removals
        this.on('remoteStreamRemoved', (connectionId: string, stream: MediaStream) => {
            callback(stream, 'removed', connectionId);
        });
    }
    
    // Get all active streams (local + remote)
    public getAllStreams(): { stream: MediaStream, connectionId?: string }[] {
        const streams: { stream: MediaStream, connectionId?: string }[] = [];
        
        // Add local stream if available
        if (this.localStream) {
            streams.push({ stream: this.localStream });
        }
        
        // Add all remote streams
        this.peerConnections.forEach((peer, connectionId) => {
            if (peer.remoteStream && peer.remoteStream.getTracks().length > 0) {
                streams.push({ stream: peer.remoteStream, connectionId });
            }
        });
        
        return streams;
    }
}
