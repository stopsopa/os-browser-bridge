

export interface BroadCastInterface  {
    event: string;
    payload: any;
    include?: string | string[];
    exclude?: string | string[];
    delay?: number;
}
export type BroadCastFn = (options: BroadCastInterface) => void;

export interface BroadCastWsInterface {

    ws: WebSocket;
    event: string;
    payload: any;
    include?: string | string[];
    exclude?: string | string[];
    delay?: number;
}

export type BroadCastWsFn = (options: BroadCastWsInterface) => void;