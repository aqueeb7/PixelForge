/**
 * Component & Peripheral Definition Schema (Spec 008)
 * Declarative component models for the Visual Breadboard & Wiring Graph Studio.
 */

export type PinType =
  | 'POWER_IN'
  | 'POWER_OUT'
  | 'GND'
  | 'I2C_SDA'
  | 'I2C_SCL'
  | 'SPI_MOSI'
  | 'SPI_MISO'
  | 'SPI_SCK'
  | 'SPI_CS'
  | 'GPIO'
  | 'ANALOG'

export type PinDirection = 'input' | 'output' | 'bidirectional' | 'power'

export interface ComponentPin {
  id: string
  label: string
  type: PinType
  requiredVoltage?: 3.3 | 5.0
  direction?: PinDirection
  description: string
  /**
   * Relative offset from top-left of component chassis in px for wire connection snapping
   */
  relativePos?: { x: number; y: number }
}

export interface ComponentDefinition {
  id: string
  name: string
  category: 'Display' | 'Input' | 'Sensor' | 'Storage' | 'Actuator' | 'Lighting'
  description: string
  icon: string
  accentColor: string
  width: number       // Visual representation width in px
  height: number      // Visual representation height in px
  pins: ComponentPin[]
  i2cAddress?: number // Default address e.g. 0x3C
  alternateI2cAddresses?: number[] // e.g. [0x3D]
  estimatedCurrentMa: number
  documentationUrl?: string
}

/**
 * Standard Library of Supported Embedded Hardware Peripherals
 */
export const COMPONENT_REGISTRY: ComponentDefinition[] = [
  {
    id: 'oled-096-ssd1306',
    name: '0.96" Monochrome OLED (SSD1306)',
    category: 'Display',
    description: '128×64 Monochrome I²C OLED Display. Core target display for PixelForge.',
    icon: '📺',
    accentColor: '#38BDF8', // Sky Cyan
    width: 220,
    height: 190,
    estimatedCurrentMa: 22,
    i2cAddress: 0x3c,
    alternateI2cAddresses: [0x3d],
    pins: [
      { id: 'GND', label: 'GND', type: 'GND', description: 'System Ground (0V)' },
      { id: 'VCC', label: 'VCC', type: 'POWER_IN', requiredVoltage: 3.3, description: 'Power supply (3.3V DC)' },
      { id: 'SCL', label: 'SCL', type: 'I2C_SCL', direction: 'input', description: 'I²C Clock bus line' },
      { id: 'SDA', label: 'SDA', type: 'I2C_SDA', direction: 'bidirectional', description: 'I²C Data bus line' },
    ],
  },
  {
    id: 'oled-091-ssd1306',
    name: '0.91" Slim OLED (128×32)',
    category: 'Display',
    description: 'Compact 128×32 I²C OLED Display for slim HUDs and handheld controllers.',
    icon: '📟',
    accentColor: '#06B6D4', // Cyan
    width: 210,
    height: 175,
    estimatedCurrentMa: 14,
    i2cAddress: 0x3c,
    alternateI2cAddresses: [0x3d],
    pins: [
      { id: 'GND', label: 'GND', type: 'GND', description: 'System Ground (0V)' },
      { id: 'VCC', label: 'VCC', type: 'POWER_IN', requiredVoltage: 3.3, description: 'Power supply (3.3V DC)' },
      { id: 'SCL', label: 'SCL', type: 'I2C_SCL', direction: 'input', description: 'I²C Clock bus line' },
      { id: 'SDA', label: 'SDA', type: 'I2C_SDA', direction: 'bidirectional', description: 'I²C Data bus line' },
    ],
  },
  {
    id: 'rotary-encoder-ec11',
    name: 'EC11 Rotary Encoder + Switch',
    category: 'Input',
    description: '360° Incremental quadrature encoder with integrated tactile push button. Perfect for timeline scrubbing.',
    icon: '🎛️',
    accentColor: '#A855F7', // Purple
    width: 210,
    height: 200,
    estimatedCurrentMa: 5,
    pins: [
      { id: 'GND', label: 'GND', type: 'GND', description: 'Common Ground' },
      { id: 'VCC', label: '+', type: 'POWER_IN', requiredVoltage: 3.3, description: 'Encoder VCC (3.3V)' },
      { id: 'SW', label: 'SW', type: 'GPIO', direction: 'input', description: 'Integrated push switch (Active LOW)' },
      { id: 'DT', label: 'DT', type: 'GPIO', direction: 'input', description: 'Quadrature Phase B output' },
      { id: 'CLK', label: 'CLK', type: 'GPIO', direction: 'input', description: 'Quadrature Phase A output' },
    ],
  },
  {
    id: 'button-momentary',
    name: 'Tactile Push Button',
    category: 'Input',
    description: 'Momentary 6x6mm micro-switch with internal pullup support for frame stepping or play/pause.',
    icon: '🔘',
    accentColor: '#EAB308', // Amber
    width: 190,
    height: 155,
    estimatedCurrentMa: 1,
    pins: [
      { id: 'PIN_A', label: 'SIG', type: 'GPIO', direction: 'input', description: 'Switch Contact A (Connect to GPIO with Pull-up)' },
      { id: 'PIN_B', label: 'GND', type: 'GND', description: 'Switch Contact B (Connect to GND for active-low)' },
    ],
  },
  {
    id: 'neopixel-ring-8',
    name: 'NeoPixel RGB Ring (8-LED)',
    category: 'Lighting',
    description: 'Addressable WS2812B RGB LED ring for status indicators, ambient backlighting, or frame ticks.',
    icon: '🌈',
    accentColor: '#EC4899', // Pink
    width: 200,
    height: 175,
    estimatedCurrentMa: 45,
    pins: [
      { id: 'GND', label: 'GND', type: 'GND', description: 'Ground (0V)' },
      { id: 'VCC', label: '5V/3V3', type: 'POWER_IN', requiredVoltage: 3.3, description: 'Power supply (3.3V or 5V VIN)' },
      { id: 'DIN', label: 'DIN', type: 'GPIO', direction: 'output', description: 'High-speed 800kHz single-wire data in' },
    ],
  },
  {
    id: 'potentiometer-10k',
    name: '10kΩ Rotary Potentiometer',
    category: 'Input',
    description: 'Linear analog dial for smooth brightness adjustment, FPS playback throttle, or threshold tuning.',
    icon: '🎚️',
    accentColor: '#14B8A6', // Teal
    width: 190,
    height: 165,
    estimatedCurrentMa: 1,
    pins: [
      { id: 'VCC', label: '3V3', type: 'POWER_IN', requiredVoltage: 3.3, description: 'High rail reference (3.3V)' },
      { id: 'OUT', label: 'SIG', type: 'ANALOG', direction: 'output', description: 'Analog wiper voltage output (0–3.3V ADC)' },
      { id: 'GND', label: 'GND', type: 'GND', description: 'Low rail reference (0V GND)' },
    ],
  },
  {
    id: 'microsd-spi',
    name: 'MicroSD SPI Storage Card',
    category: 'Storage',
    description: 'High-capacity SPI storage card reader for local storage of thousands of multi-frame animations.',
    icon: '💾',
    accentColor: '#10B981', // Emerald
    width: 220,
    height: 220,
    estimatedCurrentMa: 30,
    pins: [
      { id: 'GND', label: 'GND', type: 'GND', description: 'Ground' },
      { id: 'VCC', label: 'VCC', type: 'POWER_IN', requiredVoltage: 3.3, description: 'Power supply (3.3V)' },
      { id: 'MISO', label: 'MISO', type: 'SPI_MISO', direction: 'input', description: 'SPI Master-In Slave-Out' },
      { id: 'MOSI', label: 'MOSI', type: 'SPI_MOSI', direction: 'output', description: 'SPI Master-Out Slave-In' },
      { id: 'SCK', label: 'SCK', type: 'SPI_SCK', direction: 'output', description: 'SPI Serial Clock' },
      { id: 'CS', label: 'CS', type: 'SPI_CS', direction: 'output', description: 'Chip Select (Active LOW)' },
    ],
  },
]

/**
 * Retrieve a component definition by its unique identifier
 */
export function getComponentDefinition(id: string): ComponentDefinition | undefined {
  return COMPONENT_REGISTRY.find((c) => c.id === id)
}
