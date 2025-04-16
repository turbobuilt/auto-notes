import express from "express";
import { json } from "body-parser";
import { handleMethod } from "./handleMethod";
import http from "http";
import https from "https";
import { WebSocketServer } from "ws";
import { setupWebSocketServer } from "./wsServer";

export async function createApp() {
    const app = express();
    app.use(json({ type: 'application/json' }));

    app.post("/api/method", handleMethod);
    
    // Create HTTP server to attach WebSocket server
    let server: http.Server|https.Server;
    if (process.env.NODE_ENV === 'development') {
        server = http.createServer(app);
    } else {
        server = https.createServer({  }, app);
    }
    
    // Create and setup WebSocket server with the correct path
    const wss = new WebSocketServer({ 
        server,
        path: '/api/ws'
    });
    setupWebSocketServer(wss);
    
    return { app, server };
}