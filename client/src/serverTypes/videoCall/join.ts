import callMethod from "../../lib/callMethod";

export default function join(callId: string, connectionId: string) {
    return callMethod("videoCall.join", [...arguments]) as Promise<{ error?: string, data: { videoCall: any; activeConnections: any; } }>;
};
