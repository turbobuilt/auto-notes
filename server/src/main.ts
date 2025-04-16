import "./lib/startup";
import { createApp } from "./lib/createApp";
import { db } from "./lib/db";
import { runMigrations } from "./migrations";
import express from "express";


async function main() {
    const { app, server } = await createApp();
    await db.connect();
    await runMigrations(db);

    if (process.env.NODE_ENV === 'development') {
        server.listen(5050, () => {
            console.log("Server listening on port 5050");
        });
    } else {
        let httpApp = express();
        httpApp.use(express.static('httpPublic'));
        httpApp.listen(80, () => {
            console.log("HTTP Server listening on port 80");
        });

        app.use(express.static('public'));
        server.listen(443, () => {
            console.log("HTTPS Server listening on port 443");
        });
    }
}
main();