import { store } from '@/store';

interface WSMessage {
    id?: string;
    type?: string;
    method?: string;
    args?: any[];
    result?: any;
    error?: string;
}

export class WebSocketService {
    private ws: WebSocket | null = null;
    private connectionId: string;
    private messageHandlers = new Map<string, (data: any) => void>();
    private eventListeners = new Map<string, Set<(data: any) => void>>();
    private reconnectTimer: number | null = null;
    private messageQueue: { message: any, resolve: Function, reject: Function }[] = [];
    private messageCounter = 0;
    private connected = false;
    private connecting = false;

    constructor(connectionId: string) {
        this.connectionId = connectionId;
    }

    public async connect(): Promise<void> {
        if (this.connected || this.connecting) return;
        
        this.connecting = true;
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const baseUrl = `${protocol}//${window.location.host}/api/ws`;
        const url = new URL(baseUrl);
        
        url.searchParams.append('connectionId', this.connectionId);
        
        if (store.authToken) {
            url.searchParams.append('token', store.authToken);
        }
        
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(url.toString());
                
                this.ws.onopen = () => {
                    this.connected = true;
                    this.connecting = false;
                    
                    // Process any queued messages
                    this.processQueue();
                    
                    // Setup ping interval
                    setInterval(() => this.ping(), 25000);
                    
                    // Notify event listeners
                    this.notifyEventListeners('connect', {});
                    
                    resolve();
                };
                
                this.ws.onclose = (event) => {
                    this.connected = false;
                    this.connecting = false;
                    
                    // Notify event listeners
                    this.notifyEventListeners('disconnect', { code: event.code, reason: event.reason });
                    
                    // Schedule reconnection
                    if (!this.reconnectTimer) {
                        this.reconnectTimer = window.setTimeout(() => {
                            this.reconnectTimer = null;
                            this.connect();
                        }, 3000);
                    }
                };
                
                this.ws.onerror = (error) => {
                    this.notifyEventListeners('error', error);
                    if (!this.connected) {
                        reject(error);
                    }
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        const data: WSMessage = JSON.parse(event.data);
                        
                        // If it's a response to a message
                        if (data.id && this.messageHandlers.has(data.id)) {
                            const handler = this.messageHandlers.get(data.id);
                            if (handler) {
                                handler(data);
                                this.messageHandlers.delete(data.id);
                            }
                        } 
                        // If it's a server-initiated event
                        else if (data.type) {
                            this.notifyEventListeners(data.type, data);
                        }
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                };
            } catch (error) {
                this.connecting = false;
                reject(error);
            }
        });
    }

    public disconnect(): void {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            this.ws.close();
        }
        
        if (this.reconnectTimer) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this.connected = false;
        this.connecting = false;
    }

    public async callMethod(method: string, ...args: any[]): Promise<any> {
        const messageId = `msg_${Date.now()}_${this.messageCounter++}`;
        
        const message: WSMessage = {
            id: messageId,
            method,
            args
        };
        
        return this.sendMessage(message);
    }

    public on(event: string, callback: (data: any) => void): () => void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        
        this.eventListeners.get(event)!.add(callback);
        
        // Return unsubscribe function
        return () => {
            const listeners = this.eventListeners.get(event);
            if (listeners) {
                listeners.delete(callback);
            }
        };
    }

    private async ping(): Promise<void> {
        if (!this.connected || !this.ws) return;
        
        try {
            await this.sendMessage({ type: 'ping' });
        } catch (error) {
            console.error('WebSocket ping failed:', error);
        }
    }

    private async sendMessage(message: any): Promise<any> {
        if (!this.ws || !this.connected) {
            // Queue message if not connected
            return new Promise((resolve, reject) => {
                this.messageQueue.push({ message, resolve, reject });
                
                // Try to connect if not connecting
                if (!this.connecting) {
                    this.connect().catch(reject);
                }
            });
        }
        
        return new Promise((resolve, reject) => {
            const id = message.id || `msg_${Date.now()}_${this.messageCounter++}`;
            message.id = id;
            
            this.messageHandlers.set(id, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response.result);
                }
            });
            
            this.ws!.send(JSON.stringify(message));
            
            // Set timeout for response
            setTimeout(() => {
                if (this.messageHandlers.has(id)) {
                    this.messageHandlers.delete(id);
                    reject(new Error('WebSocket request timed out'));
                }
            }, 30000);
        });
    }

    private processQueue(): void {
        if (!this.connected) return;
        
        const queue = [...this.messageQueue];
        this.messageQueue = [];
        
        for (const item of queue) {
            this.sendMessage(item.message)
                .then(item.resolve)
                .catch(item.reject);
        }
    }

    private notifyEventListeners(event: string, data: any): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            for (const callback of listeners) {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in WebSocket ${event} event handler:`, error);
                }
            }
        }
    }
}

// Singleton service instances by connectionId
const wsInstances = new Map<string, WebSocketService>();

export function getWebSocketService(connectionId: string): WebSocketService {
    if (!wsInstances.has(connectionId)) {
        wsInstances.set(connectionId, new WebSocketService(connectionId));
    }
    return wsInstances.get(connectionId)!;
}
