import { WebRTCService } from './webrtcService';
import { sendVideoCallMessage } from './videoCallWebSocket';
import type { VideoCallWebSocketState } from './videoCallWebSocket';

export class VideoCallSignaling {
  private webrtcService: WebRTCService;
  private wsService: any;
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
  async initialize(localConnectionId: string): Promise<WebRTCService> {
    try {
      // Get local media stream
      await this.webrtcService.getLocalStream();
      
      // Set up connections with other participants if they exist
      if (this.state.videoCall && this.state.videoCall.connections) {
        // Filter out our own connection ID
        const otherConnections = this.state.videoCall.connections
          .filter(connId => connId !== localConnectionId);
        
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
    // Listen for signaling messages
    this.wsService.on('videoCallSignal', async (data: any) => {
      try {
        if (!this.state.videoCall) return;
        
        const { type, connectionId, sdp, candidate } = data;
        
        switch (type) {
          case 'offer':
            await this.webrtcService.handleOffer(connectionId, sdp);
            break;
            
          case 'answer':
            await this.webrtcService.handleAnswer(connectionId, sdp);
            break;
            
          case 'ice-candidate':
            await this.webrtcService.handleIceCandidate(connectionId, candidate);
            break;
            
          case 'new-participant':
            // New participant joined, create a connection as initiator
            await this.webrtcService.createPeerConnection(connectionId, true);
            break;
            
          case 'participant-left':
            this.webrtcService.closeConnection(connectionId);
            break;
            
          default:
            console.warn('Unknown signal type:', type);
        }
        
        // Add to events log
        this.state.events.push({
          type: 'signal',
          data,
          time: new Date()
        });
      } catch (error) {
        console.error('Error handling signal:', error);
      }
    });
  }
  
  // Send signaling message through WebSocket
  private async sendSignal(signal: any): Promise<void> {
    if (!this.state.wsConnected || !this.state.videoCall) {
      console.error('Cannot send signal: WebSocket not connected or no active call');
      return;
    }
    
    try {
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
}
