import { io, Socket } from 'socket.io-client';
import { supabase } from '../supabaseClient';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'ws://localhost:5000';

class SocketService {
  private socket: Socket | null = null;
  private connectionPromise: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this.socket?.connected) {
      console.log('[SocketService] Already connected.');
      return Promise.resolve();
    }
    
    if (!this.connectionPromise) {
      console.log('[SocketService] Starting new connection...');
      this.connectionPromise = new Promise(async (resolve, reject) => {
        try {
          let { data: { session } } = await supabase.auth.getSession();
          
          if (!session?.access_token) {
            console.log('[SocketService] No auth session found, creating guest account...');
            const { data, error } = await supabase.auth.signInAnonymously();
            if (error) {
              console.error('[SocketService] Failed to create guest account:', error);
            } else {
              session = data.session;
            }
          }
          
          const token = session?.access_token || '';

          console.log(`[SocketService] Connecting to ${SOCKET_URL} ...`);
          this.socket = io(SOCKET_URL, {
            transports: ['websocket'],
            auth: { token }
          });

          this.socket.on('connect', () => {
            console.log(`[SocketService] Successfully connected! Socket ID: ${this.socket?.id}`);
            resolve();
          });

          this.socket.on('connect_error', (error) => {
            console.error('[SocketService] Connect Error:', error);
            reject(error);
          });

          this.socket.on('disconnect', (reason) => {
            console.log('[SocketService] Disconnected. Reason:', reason);
          });
        } catch (err) {
          console.error('[SocketService] Error preparing connection:', err);
          reject(err);
        }
      });
    } else {
      console.log('[SocketService] Waiting on existing connection promise...');
    }

    return this.connectionPromise;
  }

  disconnect() {
    console.log('[SocketService] Disconnecting manually...');
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectionPromise = null;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  // Generic emit wrapper returning a promise if acknowledgment is needed,
  // or just emitting if the server sends a separate response event.
  // Based on the backend design, responses come as specific events.
  emit(event: string, payload?: any) {
    if (!this.socket?.connected) {
        console.warn('Socket not connected, cannot emit', event);
        return;
    }
    this.socket.emit(event, payload);
  }

  on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: any[]) => void) {
    this.socket?.off(event, callback);
  }
}

export const socketService = new SocketService();
