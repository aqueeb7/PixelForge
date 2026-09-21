// Core domain types for PixelForge
// These are canonical representations — display/controller-specific
// conversion happens only at the device/output boundary.

// ------------------------------------------------------------
// Application
// ------------------------------------------------------------

/** Metadata returned by the Rust get_app_info command. */
export interface AppInfo {
  name: string
  version: string
  platform: string
  mode?: 'desktop' | 'web'
}

// ------------------------------------------------------------
// Display
// ------------------------------------------------------------

/** Describes a target display's capabilities. */
export interface DisplayProfile {
  width: number
  height: number
  /** Bits per pixel. 1 for monochrome OLED. */
  colorDepth: number
  controller: string
  transport: string
}

/** Default 128×64 monochrome I2C OLED profile. */
export const DEFAULT_DISPLAY_PROFILE: DisplayProfile = {
  width: 128,
  height: 64,
  colorDepth: 1,
  controller: 'SSD1306',
  transport: 'I2C',
}

// ------------------------------------------------------------
// Bitmap / Frame
// ------------------------------------------------------------

/**
 * Canonical bitmap representation.
 * 1 bit per pixel stored as a flat Uint8Array (row-major, MSB first).
 * Packing to controller-specific page format happens at the output boundary.
 */
export interface Bitmap {
  width: number
  height: number
  /** Raw pixel data: width * height bits, packed 8 per byte. */
  data: Uint8Array
}

/** A single logical frame in a PixelForge project. */
export interface Frame {
  id: string
  bitmap: Bitmap
}

// ------------------------------------------------------------
// Animation
// ------------------------------------------------------------

export interface Animation {
  id: string
  frames: Frame[]
  fps: number
  loop: boolean
}

// ------------------------------------------------------------
// Device
// ------------------------------------------------------------

export type DeviceTransport = 'wifi' | 'serial' | 'usb'
export type DeviceStatus = 'connected' | 'disconnected' | 'connecting' | 'error'

/** Represents an ESP32 device capable of receiving PixelForge data. */
export interface Device {
  id: string
  name: string
  address: string
  transport: DeviceTransport
  status: DeviceStatus
}

export interface SerialPortDescription {
  port_name: string
  port_type: string
}

export interface DeviceInfo {
  protocol_version: number
  firmware_version: string
  device_name: string
  display_width: number
  display_height: number
  color_depth: number
  display_controller: string
}

export * from './hardware'

