import express from "express";
import { json } from "body-parser";
import { handleMethod } from "./handleMethod";

export async function createApp() {
    const app = express();
    app.use(json({ type: 'application/json' }));

    app.post("/api/method", handleMethod);
    return app;
}