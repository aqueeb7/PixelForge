/**
 * Dynamic Netlist & Wiring Model (Spec 008)
 * Models electrical nodes, wire connections, and circuit placement for the Visual Breadboard.
 */

export interface NetNode {
  instanceId: string // 'esp32' or peripheral instance ID (e.g. 'oled-1')
  pinId: string      // Pin identifier e.g. 'GPIO_21', 'D21', 'SDA', 'VCC', 'GND'
}

export interface WireNet {
  id: string
  name: string       // e.g. 'NET_I2C_SDA', 'NET_3V3', 'NET_GND'
  color: string      // Visual wire color code
  nodes: NetNode[]   // Connected endpoints
}

export interface PlottedComponent {
  instanceId: string
  definitionId: string
  name: string
  position: { x: number; y: number }
  i2cAddress?: number
  customConfig?: Record<string, any>
}

export interface WiringProjectSchema {
  version: '1.0.0'
  boardProfileId: string
  boardPosition: { x: number; y: number }
  components: PlottedComponent[]
  nets: WireNet[]
}

/**
 * Standard Electrical Color Codes (Spec 008)
 */
export const WIRE_COLOR_PALETTE = {
  POWER_3V3: '#EF4444',  // Red (3.3V)
  POWER_5V: '#F97316',   // Orange (5V / VIN)
  GND: '#4B5563',        // Dark Slate / Ground
  I2C_SCL: '#F59E0B',    // Amber (Clock)
  I2C_SDA: '#38BDF8',    // Cyan / Blue (Data)
  SPI_BUS: '#10B981',    // Emerald (MOSI/MISO/SCK/CS)
  GPIO: '#A855F7',       // Violet / Purple (Digital IO)
  ANALOG: '#14B8A6',     // Teal (ADC/DAC)
  DEFAULT: '#94A3B8',    // Slate default
}

/**
 * Automatically determine the standard wire color based on the pin characteristics
 */
export function getRecommendedWireColor(pinNameOrType: string): string {
  const upper = pinNameOrType.toUpperCase()
  if (upper.includes('3V3') || upper.includes('3.3V')) return WIRE_COLOR_PALETTE.POWER_3V3
  if (upper.includes('5V') || upper.includes('VIN')) return WIRE_COLOR_PALETTE.POWER_5V
  if (upper.includes('GND') || upper.includes('GROUND') || upper === 'B') return WIRE_COLOR_PALETTE.GND
  if (upper.includes('SCL') || upper.includes('CLOCK') || upper.includes('CLK')) return WIRE_COLOR_PALETTE.I2C_SCL
  if (upper.includes('SDA') || upper.includes('DATA') || upper.includes('DT')) return WIRE_COLOR_PALETTE.I2C_SDA
  if (upper.includes('MISO') || upper.includes('MOSI') || upper.includes('SCK') || upper.includes('CS')) return WIRE_COLOR_PALETTE.SPI_BUS
  if (upper.includes('ADC') || upper.includes('ANALOG') || upper.includes('OUT') || upper.includes('SIG')) return WIRE_COLOR_PALETTE.ANALOG
  return WIRE_COLOR_PALETTE.GPIO
}
