import "./lib/startup";
import { readFileSync } from "fs";
import { createApp } from "lib/createApp";
import { db } from "lib/db";
import { runMigrations } from "migrations";


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
    }
}
main();