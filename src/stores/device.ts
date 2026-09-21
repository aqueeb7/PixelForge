import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DeviceInfo, SerialPortDescription } from '../types'
import {
  clearDisplay as apiClearDisplay,
  connectDevice as apiConnectDevice,
  disconnectDevice as apiDisconnectDevice,
  getTestPattern as apiGetTestPattern,
  listSerialPorts as apiListPorts,
  pingDevice as apiPingDevice,
  sendFrame as apiSendFrame,
} from '../services/platform'

export const useDeviceStore = defineStore('device', () => {
  const ports = ref<SerialPortDescription[]>([])
  const selectedPort = ref<string>('')
  const status = ref<'connected' | 'disconnected' | 'connecting' | 'error'>('disconnected')
  const deviceInfo = ref<DeviceInfo | null>(null)
  const lastPingLatency = ref<number | null>(null)
  const errorMessage = ref<string | null>(null)
  const activeFrame = ref<Uint8Array | null>(null)

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
      const info = await apiConnectDevice(target, 115200)
      deviceInfo.value = info
      selectedPort.value = target
      status.value = 'connected'

      // Automatically load test pattern into preview on successful connect
      if (!activeFrame.value) {
        activeFrame.value = await apiGetTestPattern()
      }
    } catch (e) {
      status.value = 'error'
      errorMessage.value = String(e)
      deviceInfo.value = null
    }
  }

  async function disconnect() {
    try {
      await apiDisconnectDevice()
    } catch (e) {
      console.warn('Disconnect warning:', e)
    } finally {
      status.value = 'disconnected'
      deviceInfo.value = null
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
    if (status.value !== 'connected') return
    errorMessage.value = null
    try {
      await apiClearDisplay()
      // Blank out active frame in preview
      activeFrame.value = new Uint8Array(1024)
    } catch (e) {
      errorMessage.value = `Clear display failed: ${e}`
      status.value = 'error'
    }
  }

  async function sendCurrentFrame(data?: Uint8Array) {
    if (status.value !== 'connected') {
      errorMessage.value = 'Cannot send frame: ESP32 is disconnected.'
      return
    }

    const frameToSend = data || activeFrame.value
    if (!frameToSend || frameToSend.length !== 1024) {
      errorMessage.value = 'Invalid frame data: expected exactly 1024 bytes.'
      return
    }

    errorMessage.value = null
    try {
      await apiSendFrame(frameToSend)
      activeFrame.value = frameToSend
    } catch (e) {
      errorMessage.value = `Send frame failed: ${e}`
      status.value = 'error'
    }
  }

  async function sendTestPattern() {
    errorMessage.value = null
    try {
      const pattern = await apiGetTestPattern()
      activeFrame.value = pattern
      if (status.value === 'connected') {
        await apiSendFrame(pattern)
      }
    } catch (e) {
      errorMessage.value = `Test pattern error: ${e}`
    }
  }

  return {
    ports,
    selectedPort,
    status,
    deviceInfo,
    lastPingLatency,
    errorMessage,
    activeFrame,
    refreshPorts,
    connect,
    disconnect,
    ping,
    clear,
    sendCurrentFrame,
    sendTestPattern,
  }
})
