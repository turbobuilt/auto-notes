import callMethod from "../../lib/callMethod";

export default function get(id: string, connectionId: string) {
    return callMethod("videoCall.get", [...arguments]) as Promise<{ error?: string, data: { videoCall: any; } }>;
};
