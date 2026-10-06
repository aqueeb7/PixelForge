/**
 * PixelForge — Hardware Transport Abstraction
 * Spec 007 — Scalable Architecture & Transport Layer Architecture
 *
 * Decouples Pinia stores and UI views from whether communication uses
 * native Tauri serial IPC, WebSockets, or a headless Mock transport.
 */

export interface TransportEventMap {
  connected: void;
  disconnected: void;
  data: Uint8Array;
  error: Error;
}

export interface ITransport {
  readonly id: string;
  readonly isConnected: boolean;

  connect(target: string, config?: any): Promise<void>;
  disconnect(): Promise<void>;
  send(packet: Uint8Array): Promise<void>;
  on<K extends keyof TransportEventMap>(event: K, handler: (payload: TransportEventMap[K]) => void): void;
  off?<K extends keyof TransportEventMap>(event: K, handler: (payload: TransportEventMap[K]) => void): void;
}
