import callMethod from "../../lib/callMethod";
import { VideoCall } from "./VideoCall.model";

export default function create(connections: string[]) {
    return callMethod("videoCall.create", [...arguments]) as Promise<{ error?: string, data: { videoCall: import("/Users/hans/prg/auto-notes/server/src/methods/videoCall/VideoCall.model").VideoCall; } }>;
};
