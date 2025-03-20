import "./lib/startup";
import { readFileSync } from "fs";
import { createApp } from "./lib/createApp";
import { db } from "./lib/db";
import { runMigrations } from "./migrations";
import express from "express";
const https = require('https');
const path = require('path');
const fs = require('fs');


async function main() {
    const { app, server } = await createApp();
    await db.connect();
    await runMigrations(db);

    if (process.env.NODE_ENV === 'development') {
        // Using server.listen instead of app.listen because the HTTP server
        // manages both the Express app (for HTTP) and WebSocket connections.
        // The Express app is still handling HTTP requests through this server.
        server.listen(5050, () => {
            console.log("Server listening on port 5050");
        });
    } else {
        // serve 
        let httpApp = express();
        httpApp.use(express.static('httpPublic'));
        httpApp.listen(80, () => {
            console.log("HTTP Server listening on port 80");
        });
        const key = fs.readFileSync('/root/.acme.sh/autonotes.turbobuilt.com_ecc/autonotes.turbobuilt.com.key', 'utf8');
        const cert = fs.readFileSync('/root/.acme.sh/autonotes.turbobuilt.com_ecc/autonotes.turbobuilt.com.cer', 'utf8');

        const httpsServer = https.createServer({ key, cert }, httpApp);

        httpsServer.listen(443, () => {
            console.log("HTTPS Server listening on port 443");
        });
    }
}
main();