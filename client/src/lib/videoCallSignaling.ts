import { WebRTCService } from './webrtcService';
import { sendVideoCallMessage } from './videoCallWebSocket';
import type { VideoCallWebSocketState } from './videoCallWebSocket';
import type { WebSocketService } from './websocketService';

export class VideoCallSignaling {
  private webrtcService: WebRTCService;
  private wsService: WebSocketService;
  private state: VideoCallWebSocketState;
  
  constructor(wsService: any, state: VideoCallWebSocketState) {
    this.wsService = wsService;
    this.state = state;
    
    // Initialize WebRTC service with signal callback
    this.webrtcService = new WebRTCService(this.sendSignal.bind(this));
    
    // Set up signal handling
    this.setupSignalHandling();
  }
  
  // Initialize signaling and WebRTC
  async initialize(localConnectionId: string, maxRetries = 3, skipMedia = false): Promise<WebRTCService> {
    try {
      if (!skipMedia) {
        // Try to get media access with permission checking
        try {
          // First check if we have permissions
          const devices = await navigator.mediaDevices.enumerateDevices();
          const hasVideoPermission = devices.some(device => 
            device.kind === 'videoinput' && device.label !== '');
          const hasAudioPermission = devices.some(device => 
            device.kind === 'audioinput' && device.label !== '');
          
          // If we already have permissions, proceed with getLocalStream
          if (hasVideoPermission && hasAudioPermission) {
            await this.webrtcService.getLocalStream();
          } else {
            // Otherwise, explicitly request permissions first
            const stream = await navigator.mediaDevices.getUserMedia({ 
              video: true, 
              audio: true 
            });
            
            // Manually pass the stream to WebRTC service
            await this.webrtcService.setLocalStream(stream);
          }
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
      
      // Set up connections with other participants if they exist
      if (this.state.videoCall && this.state.videoCall.connections) {
        // Filter out our own connection ID and any null connections
        const otherConnections = this.state.videoCall.connections
          .filter(connId => connId !== localConnectionId && connId !== null && connId !== undefined);
        
        console.log("Setting up connections with participants:", otherConnections);
        
        // Create peer connections for each participant
        for (const connId of otherConnections) {
          // We'll be the initiator for connections to existing participants
          await this.webrtcService.createPeerConnection(connId, true);
        }
      }
      
      return this.webrtcService;
    } catch (error) {
      console.error('Error initializing video call:', error);
      throw error;
    }
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
    
    // Also listen for participant events (new-participant, participant-left)
    this.wsService.on('new-participant', async (data: any) => {
      try {
        const peerId = data.senderConnectionId || data.connectionId;
        if (peerId) {
          console.log("New participant joined:", peerId);
          await this.webrtcService.createPeerConnection(peerId, true);
          
          // Add to events log
          this.state.events.push({
            type: 'participant',
            data,
            time: new Date()
          });
        }
      } catch (error) {
        console.error('Error handling new participant:', error);
      }
    });
    
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
