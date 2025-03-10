import { getWebSocketService } from './websocketService';
import type { VideoCall } from '@/serverTypes/videoCall/VideoCall.model';

export interface VideoCallWebSocketState {
  wsConnected: boolean;
  events: Array<{type: string, data: any, time: Date}>;
  videoCall: VideoCall | null;
}

export async function initVideoCallWebSocket(
  connectionId: string,
  state: VideoCallWebSocketState
) {
  console.log("starting websocket");
  const wsService = getWebSocketService(connectionId);
  
  // Event handlers
  wsService.on('connect', () => {
    state.wsConnected = true;
    state.events.push({
      type: 'system',
      data: 'WebSocket connected',
      time: new Date()
    });
  });
  
  wsService.on('disconnect', () => {
    state.wsConnected = false;
    state.events.push({
      type: 'system',
      data: 'WebSocket disconnected',
      time: new Date()
    });
  });
  
  wsService.on('videoCall', (data) => {
    state.events.push({
      type: 'videoCall',
      data,
      time: new Date()
    });
    
    // Update video call object if it's for the current call
    if (state.videoCall && data.id === state.videoCall.id) {
      Object.assign(state.videoCall, data);
    }
  });
  
  // Add specific handler for videoCallSignal events
  wsService.on('videoCallSignal', (data) => {
    state.events.push({
      type: 'videoCallSignal',
      data,
      time: new Date()
    });
  });

  // Add handler for participant join/leave
  wsService.on('videoCallParticipant', (data) => {
    state.events.push({
      type: 'videoCallParticipant',
      data,
      time: new Date()
    });
  });

  if (state.videoCall) {
    let videoCallws = await wsService.callMethod('videoCall.get', state.videoCall.id);
    console.log("videoCallws", videoCallws);
  }
  
  // Connect to WebSocket server
  try {
    await wsService.connect();
  } catch (error) {
    console.error('Failed to connect to WebSocket:', error);
  }

  return wsService;
}

export async function sendVideoCallMessage(
  wsService: any, 
  wsConnected: boolean, 
  callId: string, 
  type: string, 
  data: any
) {
  if (!wsService || !wsConnected) {
    console.error('WebSocket not connected');
    return;
  }
  
  try {
    const result = await wsService.callMethod('videoCall.message', {
      callId,
      type,
      data
    });
    
    return result;
  } catch (error) {
    console.error('Error sending WebSocket message:', error);
    throw error;
  }
}
