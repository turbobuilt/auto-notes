import { ref } from 'vue';

export interface PeerConnection {
  connection: RTCPeerConnection;
  remoteStream: MediaStream;
  connectionId: string;
  isInitiator: boolean;
}

export class WebRTCService {
  private peerConnections: Map<string, PeerConnection> = new Map();
  private localStream = ref<MediaStream | null>(null);
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
    ]
  };
  private onSignalNeededCallback: (signal: any) => void;

  constructor(onSignalNeeded: (signal: any) => void) {
    this.onSignalNeededCallback = onSignalNeeded;
  }

  // Get local media stream
  async getLocalStream(videoEnabled = true, audioEnabled = true): Promise<MediaStream> {
    if (this.localStream.value) return this.localStream.value;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoEnabled,
        audio: audioEnabled
      });
      
      this.localStream.value = stream;
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }

  // Initialize a peer connection
  async createPeerConnection(connectionId: string, isInitiator: boolean): Promise<PeerConnection> {
    if (this.peerConnections.has(connectionId)) {
      return this.peerConnections.get(connectionId)!;
    }

    // Create RTCPeerConnection
    const peerConnection = new RTCPeerConnection(this.rtcConfig);
    const remoteStream = new MediaStream();
    
    // Ensure we have local stream
    if (!this.localStream.value) {
      await this.getLocalStream();
    }
    
    // Add all local tracks to the connection
    this.localStream.value!.getTracks().forEach(track => {
      peerConnection.addTrack(track, this.localStream.value!);
    });
    
    // Handle incoming tracks
    peerConnection.ontrack = event => {
      event.streams[0].getTracks().forEach(track => {
        remoteStream.addTrack(track);
      });
    };
    
    // Handle ICE candidates
    peerConnection.onicecandidate = event => {
      if (event.candidate) {
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
    };
    
    // Create a new peer connection object
    const peer: PeerConnection = {
      connection: peerConnection,
      remoteStream,
      connectionId,
      isInitiator
    };
    
    this.peerConnections.set(connectionId, peer);

    // If we're the initiator, create and send an offer
    if (isInitiator) {
      await this.createAndSendOffer(connectionId);
    }
    
    return peer;
  }
  
  // Create and send an offer to a peer
  async createAndSendOffer(connectionId: string): Promise<void> {
    const peer = this.peerConnections.get(connectionId);
    if (!peer) throw new Error(`No peer connection for ID: ${connectionId}`);
    
    try {
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      
      this.onSignalNeededCallback({
        type: 'offer',
        connectionId,
        sdp: peer.connection.localDescription
      });
    } catch (error) {
      console.error('Error creating offer:', error);
      throw error;
    }
  }
  
  // Handle incoming SDP offer
  async handleOffer(connectionId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    let peer = this.peerConnections.get(connectionId);
    
    // If no connection exists yet, create one
    if (!peer) {
      peer = await this.createPeerConnection(connectionId, false);
    }
    
    try {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      
      this.onSignalNeededCallback({
        type: 'answer',
        connectionId,
        sdp: peer.connection.localDescription
      });
    } catch (error) {
      console.error('Error handling offer:', error);
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
  
  // Get local stream
  getLocalMediaStream(): MediaStream | null {
    return this.localStream.value;
  }
  
  // Toggle local audio
  toggleAudio(enabled: boolean): void {
    if (this.localStream.value) {
      this.localStream.value.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }
  
  // Toggle local video
  toggleVideo(enabled: boolean): void {
    if (this.localStream.value) {
      this.localStream.value.getVideoTracks().forEach(track => {
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
    
    if (this.localStream.value) {
      this.localStream.value.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream.value = null;
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
}
