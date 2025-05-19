export class VideoCall {
    id: string;
    created: number;
    updated: number;
    creator: string;

    // the connection ids of all participants
    connections: string[];
}