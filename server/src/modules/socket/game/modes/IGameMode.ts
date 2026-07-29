import type { Socket } from "socket.io";

export interface IGameMode {
    onJoin(socket: Socket, payload: any): Promise<void>;
    onStart(socket: Socket): Promise<void>;
    onSubmitMove(socket: Socket, payload: any): Promise<void>;
    onNextRound(socket: Socket): Promise<void>;
    onLeave(socket: Socket): Promise<void>;
    onDisconnect(socket: Socket, reason: string): Promise<void>;
}
