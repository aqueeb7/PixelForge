export interface ChipDossier {
  chip_model: string
  revision: string
  mac_address: string
  flash_size_bytes: number
  flash_mode: string
  crystal_freq_mhz: number
  cpu_freq_mhz: number
  features: string[]
}

export interface DeviceTelemetry {
  timestamp_ms: number
  uptime_seconds: number
  free_heap: number
  min_free_heap: number
  total_heap: number
  heap_usage_percent: number
  current_fps: number
  oled_contrast: number
  wifi_status: 'off' | 'connecting' | 'connected' | string
  frame_counter: number
}

export interface SerialLogLine {
  id: string
  timestamp: string
  text: string
  type: 'log' | 'boot' | 'packet' | 'tx' | 'rx' | 'system'
}

export interface PacketLogEntry {
  id: string
  timestamp: string
  direction: 'TX' | 'RX'
  code: number
  name: string
  payloadLength: number
  status: 'ok' | 'error'
  latencyMs?: number
}

export interface FlashState {
  status: 'idle' | 'connecting' | 'erasing' | 'writing' | 'verifying' | 'done' | 'error'
  progress: number
  stage: string
  speedKbs: number
  bytesWritten: number
  bytesTotal: number
  errorMessage?: string
}
