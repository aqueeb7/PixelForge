/**
 * PixelForge — TauriSerialAdapter Strategy
 * Spec 007 — Scalable Architecture & Transport Layer Architecture
 *
 * Frontend adapter that bridges the ITransport interface to the Tauri IPC boundary.
 */

import type { ITransport, TransportEventMap } from './ITransport';
import {
  connectDevice as apiConnectDevice,
  disconnectDevice as apiDisconnectDevice,
  sendSerialRawHex,
} from '../../services/platform';

export class TauriSerialAdapter implements ITransport {
  readonly id = 'tauri-serial';
  private connected = false;
  private currentPort = '';
  private listeners: { [K in keyof TransportEventMap]?: Array<(payload: any) => void> } = {};

  get isConnected(): boolean {
    return this.connected;
  }

  get portName(): string {
    return this.currentPort;
  }

  async connect(target: string, config?: { baudRate?: number }): Promise<void> {
    try {
      const baud = config?.baudRate ?? 115200;
      await apiConnectDevice(target, baud);
      this.connected = true;
      this.currentPort = target;
      this.emit('connected', undefined);
    } catch (err: any) {
      this.connected = false;
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await apiDisconnectDevice();
    } finally {
      this.connected = false;
      this.currentPort = '';
      this.emit('disconnected', undefined);
    }
  }

  async send(packet: Uint8Array): Promise<void> {
    if (!this.connected) {
      const err = new Error('Cannot send packet: Serial port is not connected');
      this.emit('error', err);
      throw err;
    }

    try {
      // Send raw hex string across Tauri IPC boundary
      let hex = '';
      for (let i = 0; i < packet.length; i++) {
        hex += packet[i].toString(16).padStart(2, '0');
      }
      await sendSerialRawHex(hex);
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
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
