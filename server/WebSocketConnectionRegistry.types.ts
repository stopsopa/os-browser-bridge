

export interface BroadCastInterface  {
    event: string;
    payload: any;
    include?: string | string[];
    exclude?: string | string[];
    delay?: 0;
}
export type BroadCastFn = (options: BroadCastInterface) => void;

export interface BroadCastWsInterface {

    ws: WebSocket;
    event: string;
    payload: any;
    include?: string | string[];
    exclude?: string | string[];
    delay?: 0;
}

export type BroadCastWsFn = (options: BroadCastWsInterface) => void;