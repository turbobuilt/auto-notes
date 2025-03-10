import express from "express";
import { json } from "body-parser";
import { handleMethod } from "./handleMethod";
import http from "http";
import { WebSocketServer } from "ws";
import { setupWebSocketServer } from "./wsServer";

export async function createApp() {
    const app = express();
    app.use(json({ type: 'application/json' }));

    app.post("/api/method", handleMethod);
    
    // Create HTTP server to attach WebSocket server
    const server = http.createServer(app);
    
    // Create and setup WebSocket server with the correct path
    const wss = new WebSocketServer({ 
        server,
        path: '/api/ws'
    });
    setupWebSocketServer(wss);
    
    return { app, server };
}