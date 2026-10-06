/**
 * PixelForge — TransportFactory
 * Spec 007 — Scalable Architecture & Transport Layer Architecture
 */

import type { ITransport } from '../strategies/transport/ITransport';
import { TauriSerialAdapter } from '../strategies/transport/TauriSerialAdapter';
import { WebSocketAdapter } from '../strategies/transport/WebSocketAdapter';
import { MockTransport } from '../strategies/transport/MockTransport';

export class TransportFactory {
  private static registry = new Map<string, () => ITransport>([
    ['tauri-serial', () => new TauriSerialAdapter()],
    ['websocket', () => new WebSocketAdapter()],
    ['mock', () => new MockTransport()],
  ]);

  static register(id: string, creator: () => ITransport): void {
    this.registry.set(id, creator);
  }

  static createTransport(id: string): ITransport {
    const creator = this.registry.get(id);
    if (!creator) {
      return new TauriSerialAdapter();
    }
    return creator();
  }

  static getAvailableTransports(): string[] {
    return Array.from(this.registry.keys());
  }
}
