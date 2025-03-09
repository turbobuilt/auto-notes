import { readFileSync } from "fs";

// search for .env.development if exists
// print wd
let commonEnv = readFileSync(".env.common", { encoding: "utf-8" });

let env = readFileSync(".env.development", { encoding: "utf-8" });
process.env.NODE_ENV = "development";
if (!env) {
    process.env.NODE_ENV = "production";
    env = readFileSync(".env.production", { encoding: "utf-8" });
}
const lines = (commonEnv + "\n" + env).split("\n").filter((line) => line.trim().length > 0);
const envVars = {} as any;
for (const line of lines) {
    const parts = line.split("=");
    envVars[parts[0]] = parts[1];
}

Object.assign(process.env, envVars);