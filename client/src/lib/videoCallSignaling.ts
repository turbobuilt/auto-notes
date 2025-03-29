import { WebRTCService } from './webrtcService';
import { sendVideoCallMessage } from './videoCallWebSocket';
import type { VideoCallWebSocketState } from './videoCallWebSocket';
import type { WebSocketService } from './websocketService';

export class VideoCallSignaling {
  private webrtcService: WebRTCService;
  private wsService: WebSocketService;
  private state: VideoCallWebSocketState;
  
  constructor(wsService: any, state: VideoCallWebSocketState, existingWebRTCService?: WebRTCService) {
    this.wsService = wsService;
    this.state = state;
    
    // Use existing WebRTC service if provided, otherwise create a new one
    this.webrtcService = existingWebRTCService || new WebRTCService(this.sendSignal.bind(this));
    
    // If we're using an existing service, make sure to set the signal callback
    if (existingWebRTCService) {
      this.webrtcService.setSignalCallback(this.sendSignal.bind(this));
    }
    
    // Set up signal handling
    this.setupSignalHandling();
  }
  
  // Initialize signaling and WebRTC with better event handling
  async initialize(localConnectionId: string, maxRetries = 3, skipMedia = false): Promise<WebRTCService> {
    try {
      if (!skipMedia) {
        // Try to get media access through WebRTCService
        try {
          // Use the WebRTCService to handle getting the local stream
          await this.webrtcService.startLocalStream(true, true);
        } catch (streamError) {
          console.error('Media access error:', streamError);
          // Continue without local media
          // Add to event log
          this.state.events.push({
            type: 'warning',
            data: `Media access denied: ${streamError.message || streamError}`,
            time: new Date()
          });
        }
      }
      
      // Set up event listeners for WebRTC events
      this.setupWebRTCEventListeners();
      
      // Set up connections with other participants if they exist
      if (this.state.videoCall && this.state.videoCall.connections) {
        // Filter out our own connection ID and any null connections
        const otherConnections = this.state.videoCall.connections
          .filter(connId => connId !== localConnectionId && connId !== null && connId !== undefined);
        
        console.log("Setting up connections with participants:", otherConnections);
        
        // Create peer connections for each participant
        for (const connId of otherConnections) {
          // Determine initiator based on connection ID comparison
          const isInitiator = localConnectionId < connId;
          console.log(`Connection to ${connId}: isInitiator=${isInitiator} (local=${localConnectionId})`);
          await this.webrtcService.createPeerConnection(connId, isInitiator);
        }
      }
      
      return this.webrtcService;
    } catch (error) {
      console.error('Error initializing video call:', error);
      throw error;
    }
  }
  
  // New method to setup WebRTC event listeners
  private setupWebRTCEventListeners(): void {
    // Listen for remote streams being added
    this.webrtcService.on('remoteStreamAdded', (connectionId: string, stream: MediaStream) => {
      console.log(`SignalingService: Remote stream added from ${connectionId}`);
      // Update the list of remote connection IDs
      if (!this.state.remoteConnectionIds.includes(connectionId)) {
        this.state.remoteConnectionIds.push(connectionId);
      }
    });
    
    // Listen for connection status changes
    this.webrtcService.on('connectionStatusChanged', (connectionId: string, status: 'active' | 'stale' | 'dead') => {
      console.log(`SignalingService: Connection status changed for ${connectionId}: ${status}`);
      
      // If connection is dead, remove from remote connections list
      if (status === 'dead') {
        const index = this.state.remoteConnectionIds.indexOf(connectionId);
        if (index >= 0) {
          this.state.remoteConnectionIds.splice(index, 1);
        }
      }
    });
  }
  
  // Set up handlers for signaling messages
  private setupSignalHandling(): void {
    // Listen for specific signaling message types directly
    const signalTypes = ['offer', 'answer', 'ice-candidate'];
    
    for (const type of signalTypes) {
      this.wsService.on(type, async (data: any) => {
        try {
          if (!this.state.videoCall) return;
          
          console.log(`Received ${type} signaling message:`, data);
          const { connectionId, senderConnectionId, sdp, candidate } = data;
          
          // Use senderConnectionId if available (more reliable)
          const remoteConnectionId = senderConnectionId || connectionId;
          
          switch (type) {
            case 'offer':
              if (remoteConnectionId) {
                console.log("Handling offer from:", remoteConnectionId);
                await this.webrtcService.handleOffer(remoteConnectionId, sdp);
              }
              break;
              
            case 'answer':
              if (remoteConnectionId) {
                console.log("Handling answer from:", remoteConnectionId);
                await this.webrtcService.handleAnswer(remoteConnectionId, sdp);
              }
              break;
              
            case 'ice-candidate':
              if (remoteConnectionId) {
                console.log("Handling ICE candidate from:", remoteConnectionId);
                await this.webrtcService.handleIceCandidate(remoteConnectionId, candidate);
              }
              break;
          }
          
          // Add to events log
          this.state.events.push({
            type: 'signal',
            data,
            time: new Date()
          });
        } catch (error) {
          console.error(`Error handling ${type} signal:`, error);
        }
      });
    }
    
    // Replace the direct 'new-participant' handler with a 'videoCallSignal' handler
    this.wsService.on('videoCallSignal', async (data: any) => {
      try {
        // Check the event property to determine what type of signal it is
        if (data.event === 'new-participant') {
          console.log("new participant event:", data);
          const peerId = data.senderConnectionId || data.connectionId;
          if (peerId) {
            console.log("New participant joined:", peerId);
            
            // Determine initiator based on connection ID comparison
            const isInitiator = this.state.connectionId < peerId;
            console.log(`Connection to ${peerId}: isInitiator=${isInitiator} (local=${this.state.connectionId})`);
            await this.webrtcService.createPeerConnection(peerId, isInitiator);
            
            // Add to events log
            this.state.events.push({
              type: 'participant',
              data,
              time: new Date()
            });
          }
        } else if (data.event === 'participant-left') {
          const peerId = data.senderConnectionId || data.connectionId;
          if (peerId) {
            console.log("Participant left:", peerId);
            this.webrtcService.closeConnection(peerId);
            
            // Add to events log
            this.state.events.push({
              type: 'participant',
              data,
              time: new Date()
            });
          }
        }
      } catch (error) {
        console.error('Error handling videoCallSignal:', error);
      }
    });
    
    // Keep the existing 'participant-left' handler for backward compatibility 
    this.wsService.on('participant-left', async (data: any) => {
      try {
        const peerId = data.senderConnectionId || data.connectionId;
        if (peerId) {
          console.log("Participant left:", peerId);
          this.webrtcService.closeConnection(peerId);
          
          // Add to events log
          this.state.events.push({
            type: 'participant',
            data,
            time: new Date()
          });
        }
      } catch (error) {
        console.error('Error handling participant left:', error);
      }
    });
    
    // Listen for general videoCallParticipant events as before
    this.wsService.on('videoCallParticipant', (data: any) => {
      console.log("Participant event:", data);
      
      // If a participant left, ensure we update our tracking
      if (data.event === 'left' && data.connectionId) {
        // Close the connection if it exists in webrtcService
        const rtcConn = this.webrtcService.getConnection(data.connectionId);
        if (rtcConn) {
          this.webrtcService.closeConnection(data.connectionId);
        }
      }
      
      this.state.events.push({
        type: 'participant',
        data,
        time: new Date()
      });
    });
  }
  
  // Send signaling message through WebSocket
  private async sendSignal(signal: any): Promise<void> {
    if (!this.state.wsConnected || !this.state.videoCall) {
      console.error('Cannot send signal: WebSocket not connected or no active call');
      return;
    }
    
    // Add sender connection ID to help with routing
    signal.senderConnectionId = this.state.connectionId;
    
    try {
      console.log("Sending signal:", signal);
      await sendVideoCallMessage(
        this.wsService,
        this.state.wsConnected,
        this.state.videoCall.id,
        'signal',
        signal
      );
    } catch (error) {
      console.error('Error sending signal:', error);
      throw error;
    }
  }
  
  // Clean up and close connections
  cleanup(): void {
    this.webrtcService.closeAllConnections();
  }
  
  // Check if media permissions are already granted
  static async checkMediaPermissions(): Promise<{video: boolean, audio: boolean}> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideoPermission = devices.some(device => 
        device.kind === 'videoinput' && device.label !== '');
      const hasAudioPermission = devices.some(device => 
        device.kind === 'audioinput' && device.label !== '');
        
      return { video: hasVideoPermission, audio: hasAudioPermission };
    } catch (error) {
      console.error('Error checking media permissions:', error);
      return { video: false, audio: false };
    }
  }
  
  // Request media permissions explicitly
  static async requestMediaPermissions(): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
    } catch (error) {
      console.error('Error requesting media permissions:', error);
      return null;
    }
  }
}
