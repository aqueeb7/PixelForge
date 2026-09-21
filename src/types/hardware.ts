/**
 * Hardware Workspace & ESP32 Board Definition Types (Spec 004)
 */

export type PinCapability =
  | 'power_3v3'
  | 'power_5v'
  | 'gnd'
  | 'gpio_in'
  | 'gpio_out'
  | 'i2c_sda'
  | 'i2c_scl'
  | 'spi_mosi'
  | 'spi_miso'
  | 'spi_sck'
  | 'spi_cs'
  | 'adc1'
  | 'adc2'
  | 'dac'
  | 'touch'
  | 'uart_rx'
  | 'uart_tx'
  | 'reset'
  | 'flash_reserved'

export interface PinDefinition {
  pin_number: number
  label: string
  gpio: number | null
  capabilities: PinCapability[]
  is_strapping: boolean
  notes?: string | null
}

export interface BoardProfile {
  id: string
  name: string
  chip_family: string
  form_factor: string
  pin_count: number
  left_header: PinDefinition[]
  right_header: PinDefinition[]
}

export type PeripheralType =
  | 'OLED_128X64_I2C'
  | 'PUSH_BUTTON'
  | 'STATUS_LED'
  | 'ANALOG_SENSOR'
  | 'ROTARY_ENCODER'
  | 'CUSTOM'

export interface PeripheralDevice {
  id: string
  type: PeripheralType
  name: string
  controller?: string | null
  i2c_address?: string | null
  /**
   * Mapping of peripheral pin role (e.g. "SDA", "SCL", "VCC", "GND", "SIGNAL")
   * to board pin label (e.g. "D21 (SDA)", "D22 (SCL)", "3V3", "GND")
   */
  pins: Record<string, string>
  status: 'configured' | 'verified' | 'conflict' | 'error'
}

export interface HardwareConfig {
  version: number
  board_id: string
  board_name: string
  peripherals: PeripheralDevice[]
}

export interface PinAssignmentInfo {
  peripheralId: string
  peripheralName: string
  peripheralType: PeripheralType
  role: string
}

export type IssueSeverity = 'warning' | 'error' | 'info'

export interface ValidationIssue {
  id: string
  severity: IssueSeverity
  title: string
  message: string
  peripheralId?: string
  pinLabel?: string
}
