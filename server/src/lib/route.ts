import { IncomingMessage, ServerResponse } from "http"
import { User } from "methods/user/user.model";
import { RouteOptions, RouteParameters } from "./handleMethod";


export function route(handler: (params: RouteParameters, ...args: any[]) => any, options: RouteOptions = new RouteOptions()) {
    (handler as any).options = Object.assign(new RouteOptions(), options || {});
    return { handler, options };
}