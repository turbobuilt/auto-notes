import { IncomingMessage, ServerResponse } from "http";
import { User } from "methods/user/user.model";
import path from 'path';
import formidable from 'formidable';
import { db } from "./db";

export interface RouteParameters {
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    searchParams: URLSearchParams,
    isIosApp: boolean,
    isAndroidApp: boolean,
    isWeb: boolean,
    user: User
    requestIp: string
    body: any
}

export class RouteOptions {
    public?: boolean = false;
    useFormData?: boolean = false;
    organizationNotRequired?: boolean = false;
    streamResponse?: boolean = false;
    keepAlive?: boolean = false;
}

export async function handleMethod(req, res) {
    console.log("Handling method", req.url);
    try {
        // Determine if using FormData or JSON
        const contentType = req.headers['content-type'] || '';
        const isFormData = contentType.includes('multipart/form-data');
        
        let methodName = '';
        let args = [];

        let url = new URL(req.url, `http://${req.headers.host}`);
        console.log("is FormData:", isFormData, "contentType:", contentType);
        if (isFormData) {
            console.log("Parsing FormData request");
            // Parse FormData request
            methodName = req.headers['method-name'] as string;
            
            const form = new formidable.IncomingForm();
            const [fields, files] = await new Promise((resolve, reject) => {
                form.parse(req, (err, fields, files) => {
                    if (err) reject(err);
                    resolve([fields, files]);
                });
            }) as any;
            
            // Sort arguments by their index
            const argKeys = Object.keys(fields).filter(key => key.startsWith('arg_'));
            const maxIndex = Math.max(...argKeys.map(key => parseInt(key.substring(4))));
            
            for (let i = 0; i <= maxIndex; i++) {
                const fieldKey = `arg_${i}`;
                if (fields[fieldKey]) {
                    try {
                        // Try to parse as JSON, otherwise use as is
                        args[i] = JSON.parse(fields[fieldKey].toString());
                    } catch {
                        args[i] = fields[fieldKey];
                    }
                } else if (files[fieldKey]) {
                    args[i] = files[fieldKey];
                }
            }
        } else if (req.headers['content-type'] === 'application/json') {
            // Parse JSON request
            methodName = req.body.method;
            args = req.body.args || [];
        } else {
            methodName = url.searchParams.get("method") as string;
        }
        
        if (!methodName) {
            res.status(400).json({ error: "Method name is required" });
            return;
        }
        
        // Convert method name to file path (user.createAccount -> methods/user/createAccount)
        const methodParts = methodName.split('.');
        const methodFilePath = path.join(process.cwd(), 'src', 'methods', ...methodParts);
        
        // Import the method module dynamically
        let methodModule;
        try {
            methodModule = await import(methodFilePath);
        } catch (error) {
            res.status(404).json({ error: `Method ${methodName} not found` });
            return;
        }
        
        const { handler, options } = methodModule.default;
        
        // Check authentication unless public
        let user = null;
        if (!options.public) {
            const authToken = req.headers.authorization || req.body?.authorization;
            console.log("Auth token:", authToken);
            if (!authToken) {
                res.status(401).json({ error: "Authentication required" });
                return;
            }
            
            // Find user by auth token (implementation would depend on your auth system)
            [user] = await db.query`select "entity".* from "entity"
            where kind='User' AND id = (SELECT entity.data->>'user' FROM entity WHERE entity.data->>'authToken' = ${authToken} and entity.kind = 'AuthToken')`;
            if (!user) {
                res.status(401).json({ error: "Invalid authentication token" });
                return;
            }
        }
        
        // Create route parameters
        const routeParams = {
            req,
            res,
            url: new URL(req.url, `http://${req.headers.host}`),
            searchParams: new URLSearchParams(req.url.split('?')[1] || ''),
            isIosApp: req.headers['user-agent']?.includes('iOS') || false,
            isAndroidApp: req.headers['user-agent']?.includes('Android') || false,
            isWeb: !req.headers['user-agent']?.includes('iOS') && !req.headers['user-agent']?.includes('Android'),
            user,
            requestIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
            body: req.body
        };
        
        // Execute the method handler
        const result = await handler(routeParams, ...args);
        
        // Handle different response types based on options
        if (options.streamResponse) {
            if (result && typeof result.pipe === 'function') {
                result.pipe(res);
                return;
            }
        }
        
        // Handle binary response
        if (result instanceof Buffer || result instanceof Uint8Array) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.end(result);
            return;
        }
        
        // Handle regular JSON response
        res.json(result);
    } catch (error) {
        console.error('Error handling method:', error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
}