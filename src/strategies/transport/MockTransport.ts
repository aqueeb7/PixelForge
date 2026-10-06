/**
 * PixelForge — MockTransport Strategy
 * Spec 007 — Scalable Architecture & Transport Layer Architecture
 *
 * In-memory software test stub that simulates packet round-trips
 * (echoing PING ACKs, dummy telemetry) so that CI/CD and frontend unit tests
 * can run in pure Node/browser environments without hardware or Tauri binaries.
 */

import type { ITransport, TransportEventMap } from './ITransport';

export class MockTransport implements ITransport {
  readonly id = 'mock';
  private connected = false;
  private listeners: { [K in keyof TransportEventMap]?: Array<(payload: any) => void> } = {};
  private mockLatencyMs = 12;

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(target = 'MOCK_PORT', _config?: any): Promise<void> {
    await new Promise(r => setTimeout(r, this.mockLatencyMs));
    this.connected = true;
    this.emit('connected', undefined);
    console.log(`[MockTransport] Connected to ${target}`);
  }

  async disconnect(): Promise<void> {
    await new Promise(r => setTimeout(r, this.mockLatencyMs));
    this.connected = false;
    this.emit('disconnected', undefined);
    console.log('[MockTransport] Disconnected');
  }

  async send(packet: Uint8Array): Promise<void> {
    if (!this.connected) {
      const err = new Error('Cannot send packet: MockTransport is disconnected');
      this.emit('error', err);
      throw err;
    }

    // Packet inspection & deterministic mock responses
    // Framing: SOF (0xAA), CMD (byte 1), LEN_H (2), LEN_L (3), ...
    const cmd = packet[1];

    setTimeout(() => {
      if (cmd === 0x01) {
        // CMD_PING (0x01) -> RESP_PONG (0x81)
        const pong = new Uint8Array([0xAA, 0x81, 0x00, 0x00, 0x00, 0x55]);
        this.emit('data', pong);
      } else if (cmd === 0x02) {
        // CMD_GET_DEVICE_INFO (0x02) -> RESP_DEVICE_INFO (0x82)
        const payload = new TextEncoder().encode(JSON.stringify({
          device: 'PixelForge-MockESP32',
          firmware: '0.1.0-mock',
          width: 128,
          height: 64,
          chip: 'ESP32-D0WDQ6-V3 (Simulated)',
        }));
        const resp = new Uint8Array(6 + payload.length);
        resp[0] = 0xAA;
        resp[1] = 0x82;
        resp[2] = (payload.length >> 8) & 0xFF;
        resp[3] = payload.length & 0xFF;
        resp.set(payload, 4);
        resp[resp.length - 1] = 0x55;
        this.emit('data', resp);
      } else if (cmd === 0x03) {
        // CMD_SEND_FRAME (0x03) -> RESP_FRAME_ACK (0x83)
        const ack = new Uint8Array([0xAA, 0x83, 0x00, 0x00, 0x00, 0x55]);
        this.emit('data', ack);
      }
    }, this.mockLatencyMs);
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
