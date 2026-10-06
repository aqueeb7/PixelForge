/**
 * PixelForge — WebSocketAdapter Strategy
 * Spec 007 — Scalable Architecture & Transport Layer Architecture
 *
 * Network transport allowing PixelForge to communicate with wireless ESP32s
 * or headless remote daemons via WebSockets.
 */

import type { ITransport, TransportEventMap } from './ITransport';

export class WebSocketAdapter implements ITransport {
  readonly id = 'websocket';
  private ws: WebSocket | null = null;
  private listeners: { [K in keyof TransportEventMap]?: Array<(payload: any) => void> } = {};

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(target: string): Promise<void> {
    const url = target.startsWith('ws://') || target.startsWith('wss://') ? target : `ws://${target}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          this.emit('connected', undefined);
          resolve();
        };

        this.ws.onclose = () => {
          this.emit('disconnected', undefined);
          this.ws = null;
        };

        this.ws.onerror = (e) => {
          const err = new Error(`WebSocket error on ${url}: ${e}`);
          this.emit('error', err);
          reject(err);
        };

        this.ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            this.emit('data', new Uint8Array(event.data));
          }
        };
      } catch (err: any) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emit('error', error);
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.emit('disconnected', undefined);
  }

  async send(packet: Uint8Array): Promise<void> {
    if (!this.isConnected || !this.ws) {
      const err = new Error('Cannot send packet: WebSocket is not open');
      this.emit('error', err);
      throw err;
    }
    this.ws.send(packet as unknown as BufferSource);
  }

  on<K extends keyof TransportEventMap>(event: K, handler: (payload: TransportEventMap[K]) => void): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(handler);
  }

  off<K extends keyof TransportEventMap>(event: K, handler: (payload: TransportEventMap[K]) => void): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event]!.filter(h => h !== handler);
  }

  private emit<K extends keyof TransportEventMap>(event: K, payload: TransportEventMap[K]): void {
    const handlers = this.listeners[event];
    if (handlers) {
      for (const h of handlers) {
        h(payload);
      }
    }
  }
}
