import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DeviceInfo, SerialPortDescription } from '../types'
import type { ChipDossier, DeviceTelemetry } from '../types/monitor'
import {
  clearDisplay as apiClearDisplay,
  connectDevice as apiConnectDevice,
  detectChipDossier as apiDetectChipDossier,
  disconnectDevice as apiDisconnectDevice,
  getTelemetry as apiGetTelemetry,
  getTestPattern as apiGetTestPattern,
  listSerialPorts as apiListPorts,
  pingDevice as apiPingDevice,
  pollSerialEvents as apiPollEvents,
  restartDevice as apiRestartDevice,
  sendFrame as apiSendFrame,
} from '../services/platform'
import { useMonitorStore } from './monitor'

export const useDeviceStore = defineStore('device', () => {
  const ports = ref<SerialPortDescription[]>([])
  const selectedPort = ref<string>('')
  const baudRate = ref<number>(115200)
  const status = ref<'connected' | 'disconnected' | 'connecting' | 'error'>('disconnected')
  const deviceInfo = ref<DeviceInfo | null>(null)
  const chipDossier = ref<ChipDossier | null>(null)
  const telemetry = ref<DeviceTelemetry | null>(null)
  const lastPingLatency = ref<number | null>(null)
  const errorMessage = ref<string | null>(null)
  const activeFrame = ref<Uint8Array | null>(null)
  const autoReconnect = ref<boolean>(true)

  let telemetryInterval: ReturnType<typeof setInterval> | null = null

  async function refreshPorts() {
    try {
      errorMessage.value = null
      const list = await apiListPorts()
      ports.value = list
      if (list.length > 0 && !selectedPort.value) {
        selectedPort.value = list[0].port_name
      }
    } catch (e) {
      errorMessage.value = `Failed to list serial ports: ${e}`
    }
  }

  async function connect(portToConnect?: string) {
    const target = portToConnect || selectedPort.value
    if (!target) {
      errorMessage.value = 'Please select a valid COM port first.'
      return
    }

    status.value = 'connecting'
    errorMessage.value = null
    lastPingLatency.value = null

    try {
      const info = await apiConnectDevice(target, baudRate.value)
      deviceInfo.value = info
      selectedPort.value = target
      status.value = 'connected'

      // Automatically load test pattern into preview on successful connect
      if (!activeFrame.value) {
        activeFrame.value = await apiGetTestPattern()
      }

      // Sync active frame to hardware display immediately on connect
      try {
        if (activeFrame.value) {
          await apiSendFrame(activeFrame.value)
        }
      } catch (err) {
        console.warn('Initial hardware frame sync notice:', err)
      }

      // Fetch Silicon Specs Dossier
      try {
        chipDossier.value = await apiDetectChipDossier()
      } catch (e) {
        console.warn('Chip dossier detection warning:', e)
      }

      // Start Telemetry Polling (every 1.5s)
      startTelemetryPolling()
    } catch (e) {
      status.value = 'error'
      errorMessage.value = String(e)
      deviceInfo.value = null
      chipDossier.value = null
      stopTelemetryPolling()
    }
  }

  function startTelemetryPolling() {
    stopTelemetryPolling()
    fetchTelemetry()

    telemetryInterval = setInterval(async () => {
      if (status.value === 'connected') {
        await fetchTelemetry()
        await pollEvents()
      }
    }, 1500)
  }

  function stopTelemetryPolling() {
    if (telemetryInterval) {
      clearInterval(telemetryInterval)
      telemetryInterval = null
    }
  }

  async function fetchTelemetry() {
    if (status.value !== 'connected') return
    try {
      const data = await apiGetTelemetry()
      telemetry.value = data

      // Log packet to monitor packet inspector
      const monitorStore = useMonitorStore()
      monitorStore.addPacket('RX', 0x85, 'TELEMETRY_DATA', 24, 'ok')
    } catch (e) {
      console.warn('Telemetry fetch error:', e)
    }
  }

  async function pollEvents() {
    if (status.value !== 'connected') return
    try {
      const events = await apiPollEvents()
      if (events && events.length > 0) {
        const monitorStore = useMonitorStore()
        for (const line of events) {
          if (line.startsWith('[BOOT]')) {
            monitorStore.addLog(line.replace('[BOOT] ', ''), 'boot')
          } else if (line.startsWith('[PKT]')) {
            monitorStore.addLog(line, 'packet')
          } else {
            monitorStore.addLog(line.replace('[LOG] ', ''), 'log')
          }
        }
      }
    } catch (e) {
      console.warn('Poll events warning:', e)
    }
  }

  async function restart(hard = false) {
    if (status.value !== 'connected') return
    try {
      await apiRestartDevice(hard)
      const monitorStore = useMonitorStore()
      monitorStore.addLog(`[SYSTEM] Device ${hard ? 'hard' : 'soft'} restart initiated`, 'system')
    } catch (e) {
      errorMessage.value = `Restart failed: ${e}`
    }
  }

  async function disconnect() {
    stopTelemetryPolling()
    try {
      await apiDisconnectDevice()
    } catch (e) {
      console.warn('Disconnect warning:', e)
    } finally {
      status.value = 'disconnected'
      deviceInfo.value = null
      chipDossier.value = null
      telemetry.value = null
      lastPingLatency.value = null
      errorMessage.value = null
    }
  }

  async function ping(): Promise<number | null> {
    if (status.value !== 'connected') return null
    errorMessage.value = null
    try {
      const latency = await apiPingDevice()
      lastPingLatency.value = latency
      return latency
    } catch (e) {
      errorMessage.value = `Ping failed: ${e}`
      status.value = 'error'
      return null
    }
  }

  async function clear() {
    activeFrame.value = new Uint8Array(1024)
    if (status.value !== 'connected') return
    errorMessage.value = null
    try {
      await apiClearDisplay()
    } catch (e) {
      errorMessage.value = `Clear display failed: ${e}`
      status.value = 'error'
    }
  }

  async function sendCurrentFrame(data?: Uint8Array) {
    const frameToSend = data || activeFrame.value
    if (!frameToSend || frameToSend.length !== 1024) {
      errorMessage.value = 'Invalid frame data: expected exactly 1024 bytes.'
      return
    }

    activeFrame.value = new Uint8Array(frameToSend)

    if (status.value !== 'connected') {
      errorMessage.value = 'Cannot send frame: ESP32 is disconnected.'
      return
    }

    errorMessage.value = null
    try {
      await apiSendFrame(activeFrame.value)
    } catch (e) {
      errorMessage.value = `Send frame failed: ${e}`
      status.value = 'error'
    }
  }

  async function sendTestPattern() {
    errorMessage.value = null
    try {
      const pattern = await apiGetTestPattern()
      activeFrame.value = new Uint8Array(pattern)
      if (status.value === 'connected') {
        await apiSendFrame(activeFrame.value)
      }
    } catch (e) {
      errorMessage.value = `Test pattern error: ${e}`
    }
  }

  return {
    ports,
    selectedPort,
    baudRate,
    status,
    deviceInfo,
    chipDossier,
    telemetry,
    lastPingLatency,
    errorMessage,
    activeFrame,
    autoReconnect,
    refreshPorts,
    connect,
    disconnect,
    ping,
    clear,
    sendCurrentFrame,
    sendTestPattern,
    fetchTelemetry,
    restart,
  }
})
