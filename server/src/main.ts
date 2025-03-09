import "./lib/startup";
import { readFileSync } from "fs";
import { createApp } from "lib/createApp";
import { db } from "lib/db";
import { runMigrations } from "migrations";


async function main() {
    let app = await createApp();
    await db.connect();
    await runMigrations(db);

    if (process.env.NODE_ENV === 'development') {
        app.listen(5050, () => {
            console.log("Server listening on port 5050");
        });
    }
}
main();