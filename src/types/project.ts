/**
 * PixelForge Project Domain Schema (Spec 012)
 * Represents a complete, portable maker project incorporating
 * display configuration, pinout wiring, 1-bit sprites, and C++ firmware code.
 */

import type { WiringProjectSchema } from '../core/hardware/Netlist'

export interface ProjectDisplayConfig {
  width: number
  height: number
  controller: 'SH1106' | 'SSD1306' | 'SSD1309' | 'GENERIC_OLED'
  driver: 'U8G2' | 'Adafruit'
  i2cAddress: number
  sdaGpio: number
  sclGpio: number
}

export interface ProjectSprite {
  id: string
  name: string
  width: number
  height: number
  dataAscii: string[]
  cArraySnippet?: string
}

export interface PixelForgeProject {
  id: string
  name: string
  description: string
  category: 'Game' | 'Animation' | 'HUD' | 'Sensor' | 'Custom'
  createdAt: string
  updatedAt: string
  icon: string
  targetBoard: string
  display: ProjectDisplayConfig
  wiringPreset?: 'space_shooter' | 'oled_default' | 'reel_station' | 'dual_oled' | 'blank'
  wiring?: WiringProjectSchema
  sprites: ProjectSprite[]
  customCode: string
  isTemplate?: boolean
}
