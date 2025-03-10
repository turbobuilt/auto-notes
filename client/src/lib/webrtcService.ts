export interface PeerConnection {
  connection: RTCPeerConnection;
  remoteStream: MediaStream;
  connectionId: string;
  isInitiator: boolean;
  connected: boolean;
}

export class WebRTCService {
  // Change access modifiers to public to avoid proxy interference
  public peerConnections: Map<string, PeerConnection> = new Map();
  public localStream: MediaStream | null;
  public rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
    ]
  };
  public onSignalNeededCallback: (signal: any) => void;
  public onRemoteStreamAddedCallback: ((connectionId: string, stream: MediaStream) => void) | null = null;

  constructor(onSignalNeeded: (signal: any) => void) {
    this.onSignalNeededCallback = onSignalNeeded;
    this.localStream = null;
    console.log("WebRTCService initialized with localStream:", this.localStream);
  }

  // Set callback for remote stream events
  setOnRemoteStreamAdded(callback: (connectionId: string, stream: MediaStream) => void): void {
    this.onRemoteStreamAddedCallback = callback;
  }

  // Get local media stream with defensive programming
  async getLocalStream(videoEnabled = true, audioEnabled = true): Promise<MediaStream> {
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
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }

  // Set local media stream with added safety
  async setLocalStream(stream: MediaStream): Promise<void> {
    console.log("setLocalStream called with:", stream);
    if (stream) {
      this.localStream = stream;
    }
  }

  // Get local stream - safer version
  getLocalMediaStream(): MediaStream | null {
    return this.localStream;
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
    if (!this.localStream) {
      try {
        await this.getLocalStream();
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
      }
    };
    
    // Handle ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state for ${connectionId}: ${peerConnection.iceConnectionState}`);
    };
    
    // Create a new peer connection object
    const peer: PeerConnection = {
      connection: peerConnection,
      remoteStream,
      connectionId,
      isInitiator,
      connected: false
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
  
  // Clean up and close all connections
  closeAllConnections(): void {
    this.peerConnections.forEach(peer => {
      peer.connection.close();
    });
    
    this.peerConnections.clear();
    
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
}
