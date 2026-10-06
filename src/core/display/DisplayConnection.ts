/**
 * PixelForge — DisplayConnection Domain Model
 * Spec 007 — Scalable Architecture & Decoupled Hardware Domain
 *
 * Separates physical wiring instances (I2C address, SPI pins, clock rate)
 * from the screen's intrinsic traits (DisplayProfile).
 */

export interface SpiPinConfiguration {
  mosi: number;
  sclk: number;
  cs: number;
  dc: number;
  rst: number;
}

export interface DisplayConnectionConfig {
  transport: 'I2C' | 'SPI';
  i2cAddress?: number; // e.g., 0x3C, 0x3D
  spiPins?: SpiPinConfiguration;
  clockSpeedHz: number; // e.g. 400000 for I2C fast mode, 10000000 for SPI
}

export class DisplayConnection {
  readonly transport: 'I2C' | 'SPI';
  readonly i2cAddress: number;
  readonly spiPins?: SpiPinConfiguration;
  readonly clockSpeedHz: number;

  constructor(config: DisplayConnectionConfig) {
    this.transport = config.transport;
    this.i2cAddress = config.i2cAddress ?? 0x3C;
    this.spiPins = config.spiPins;
    this.clockSpeedHz = config.clockSpeedHz;
  }

  get summary(): string {
    if (this.transport === 'I2C') {
      const hexAddr = '0x' + this.i2cAddress.toString(16).toUpperCase();
      return `I²C @ ${hexAddr} (${Math.round(this.clockSpeedHz / 1000)} kHz)`;
    }
    return `SPI @ ${Math.round(this.clockSpeedHz / 1000000)} MHz (CS: ${this.spiPins?.cs ?? 'N/A'})`;
  }
}
