import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
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

/**
 * Spec 007 — Finite State Machine for Device Connection
 * Replaces ad-hoc booleans with deterministic state transitions.
 */
export type DeviceConnectionState =
  | 'Disconnected'
  | 'Scanning'
  | 'Connecting'
  | 'Handshaking'
  | 'Online'
  | 'Disconnecting'
  | 'Error';

export type HardwareOperationType =
  | 'idle'
  | 'send_frame'
  | 'clear_display'
  | 'test_pattern'
  | 'ping'
  | 'connect'
  | 'disconnect';

export type TransactionStep =
  | 'idle'
  | 'preparing'     // Packaging, CRC8 calculation, validating 1024-byte boundary
  | 'transmitting'  // Sending packet across serial port at configured baud rate
  | 'awaiting_ack'  // Waiting for ESP32 hardware response & OLED I2C flush
  | 'completed'     // Hardware ACK received, frame confirmed displayed
  | 'failed';       // Error or timeout

export interface ActiveTransaction {
  id: string;
  type: HardwareOperationType;
  step: TransactionStep;
  title: string;
  detail: string;
  progress: number; // 0 to 100
  elapsedMs: number;
  totalBytes?: number;
  transferredBytes?: number;
  startTime: number;
  endTime?: number;
  port?: string;
  error?: string;
}

export const useDeviceStore = defineStore('device', () => {
  const ports = ref<SerialPortDescription[]>([])
  const selectedPort = ref<string>('')
  const baudRate = ref<number>(115200)

  // Connection FSM State
  const connectionState = ref<DeviceConnectionState>('Disconnected')

  // Live Hardware Transaction State Machine
  const activeTransaction = ref<ActiveTransaction | null>(null)
  const lastTransaction = ref<ActiveTransaction | null>(null)
  let transactionTimer: ReturnType<typeof setInterval> | null = null
  let dismissTimer: ReturnType<typeof setTimeout> | null = null

  // Backwards-compatible legacy status computed from FSM state
  const status = computed<'connected' | 'disconnected' | 'connecting' | 'error'>(() => {
    switch (connectionState.value) {
      case 'Online':
        return 'connected'
      case 'Connecting':
      case 'Handshaking':
        return 'connecting'
      case 'Error':
        return 'error'
      default:
        return 'disconnected'
    }
  })

  const deviceInfo = ref<DeviceInfo | null>(null)
  const chipDossier = ref<ChipDossier | null>(null)
  const telemetry = ref<DeviceTelemetry | null>(null)
  const lastPingLatency = ref<number | null>(null)
  const errorMessage = ref<string | null>(null)
  const activeFrame = ref<Uint8Array | null>(null)
  const autoReconnect = ref<boolean>(true)

  // Operational transition locks
  const isPinging = ref<boolean>(false)
  const isRebooting = ref<boolean>(false)
  const isClearing = ref<boolean>(false)

  const isDisconnecting = computed(() => connectionState.value === 'Disconnecting')
  const isRefreshingPorts = computed(() => connectionState.value === 'Scanning')

  let telemetryInterval: ReturnType<typeof setInterval> | null = null

  function startTransaction(
    type: HardwareOperationType,
    title: string,
    detail: string,
    totalBytes?: number
  ) {
    if (dismissTimer) {
      clearTimeout(dismissTimer)
      dismissTimer = null
    }
    if (transactionTimer) {
      clearInterval(transactionTimer)
      transactionTimer = null
    }

    const startTime = performance.now()
    activeTransaction.value = {
      id: `${type}-${Date.now()}`,
      type,
      step: 'preparing',
      title,
      detail,
      progress: 20,
      elapsedMs: 0,
      totalBytes,
      transferredBytes: 0,
      startTime,
      port: selectedPort.value,
    }

    transactionTimer = setInterval(() => {
      if (
        activeTransaction.value &&
        activeTransaction.value.step !== 'completed' &&
        activeTransaction.value.step !== 'failed'
      ) {
        activeTransaction.value.elapsedMs = Math.round(
          performance.now() - activeTransaction.value.startTime
        )
      }
    }, 30)
  }

  function updateTransaction(
    step: TransactionStep,
    detail: string,
    progress: number,
    transferredBytes?: number
  ) {
    if (!activeTransaction.value) return
    activeTransaction.value.step = step
    activeTransaction.value.detail = detail
    activeTransaction.value.progress = progress
    if (transferredBytes !== undefined) {
      activeTransaction.value.transferredBytes = transferredBytes
    }
    activeTransaction.value.elapsedMs = Math.round(
      performance.now() - activeTransaction.value.startTime
    )
  }

  function completeTransaction(detail: string) {
    if (!activeTransaction.value) return
    if (transactionTimer) {
      clearInterval(transactionTimer)
      transactionTimer = null
    }
    const duration = Math.round(performance.now() - activeTransaction.value.startTime)
    activeTransaction.value.step = 'completed'
    activeTransaction.value.detail = detail
    activeTransaction.value.progress = 100
    activeTransaction.value.elapsedMs = duration
    activeTransaction.value.endTime = performance.now()

    lastTransaction.value = { ...activeTransaction.value }

    dismissTimer = setTimeout(() => {
      if (activeTransaction.value?.step === 'completed') {
        activeTransaction.value = null
      }
    }, 2800)
  }

  function failTransaction(err: string) {
    if (!activeTransaction.value) return
    if (transactionTimer) {
      clearInterval(transactionTimer)
      transactionTimer = null
    }
    const duration = Math.round(performance.now() - activeTransaction.value.startTime)
    activeTransaction.value.step = 'failed'
    activeTransaction.value.detail = err
    activeTransaction.value.error = err
    activeTransaction.value.elapsedMs = duration
    activeTransaction.value.endTime = performance.now()

    lastTransaction.value = { ...activeTransaction.value }

    dismissTimer = setTimeout(() => {
      if (activeTransaction.value?.step === 'failed') {
        activeTransaction.value = null
      }
    }, 4500)
  }

  async function refreshPorts() {
    if (connectionState.value === 'Connecting' || connectionState.value === 'Disconnecting') {
      return
    }

    const previousState = connectionState.value
    connectionState.value = 'Scanning'

    try {
      errorMessage.value = null
      const list = await apiListPorts()
      ports.value = list
      if (list.length > 0 && !selectedPort.value) {
        selectedPort.value = list[0].port_name
      }
    } catch (e) {
      errorMessage.value = `Failed to list serial ports: ${e}`
    } finally {
      connectionState.value = previousState === 'Online' ? 'Online' : 'Disconnected'
    }
  }

  async function connect(portToConnect?: string) {
    const target = portToConnect || selectedPort.value
    if (!target) {
      errorMessage.value = 'Please select a valid COM port first.'
      return
    }

    if (connectionState.value === 'Connecting' || connectionState.value === 'Online') {
      return
    }

    connectionState.value = 'Connecting'
    errorMessage.value = null
    lastPingLatency.value = null
    startTransaction('connect', 'Connect to ESP32', `Opening ${target} @ ${baudRate.value} baud...`)

    try {
      const info = await apiConnectDevice(target, baudRate.value)
      deviceInfo.value = info
      selectedPort.value = target

      // Advance FSM to Handshaking
      connectionState.value = 'Handshaking'
      updateTransaction('awaiting_ack', `Handshaking with ${info.device_name}...`, 60)

      // Automatically load test pattern into preview on successful connect
      if (!activeFrame.value) {
        activeFrame.value = await apiGetTestPattern()
      }

      // Sync active frame to hardware display immediately on connect
      try {
        if (activeFrame.value) {
          updateTransaction('transmitting', 'Syncing initial frame to OLED display...', 80, 1024)
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

      // Handshake succeeded: Device is now Online
      connectionState.value = 'Online'
      completeTransaction(`✓ Online: Connected to ${target} (${activeTransaction.value?.elapsedMs || 0}ms)`)

      // Start Telemetry Polling (every 1.5s)
      startTelemetryPolling()
    } catch (e) {
      connectionState.value = 'Error'
      const errStr = String(e)
      errorMessage.value = errStr
      deviceInfo.value = null
      chipDossier.value = null
      failTransaction(`Connection failed: ${errStr}`)
      stopTelemetryPolling()
    }
  }

  function startTelemetryPolling() {
    stopTelemetryPolling()
    fetchTelemetry()

    telemetryInterval = setInterval(async () => {
      if (connectionState.value === 'Online') {
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
    if (connectionState.value !== 'Online') return
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
    if (connectionState.value !== 'Online') return
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
    if (connectionState.value !== 'Online' || isRebooting.value) return
    isRebooting.value = true
    startTransaction('disconnect', 'Restart Device', `Initiating ${hard ? 'hard' : 'soft'} restart...`)
    try {
      await apiRestartDevice(hard)
      const monitorStore = useMonitorStore()
      monitorStore.addLog(`[SYSTEM] Device ${hard ? 'hard' : 'soft'} restart initiated`, 'system')
      await new Promise((r) => setTimeout(r, 1200))
      completeTransaction('✓ Restart pulse completed')
    } catch (e) {
      errorMessage.value = `Restart failed: ${e}`
      failTransaction(`Restart error: ${e}`)
    } finally {
      isRebooting.value = false
    }
  }

  async function disconnect() {
    if (connectionState.value === 'Disconnecting' || connectionState.value === 'Disconnected') {
      return
    }

    connectionState.value = 'Disconnecting'
    stopTelemetryPolling()
    startTransaction('disconnect', 'Disconnect Hardware', `Releasing port ${selectedPort.value}...`)

    try {
      await apiDisconnectDevice()
      completeTransaction('✓ Hardware port disconnected')
    } catch (e) {
      console.warn('Disconnect warning:', e)
      failTransaction(`Disconnect warning: ${e}`)
    } finally {
      connectionState.value = 'Disconnected'
      deviceInfo.value = null
      chipDossier.value = null
      telemetry.value = null
      lastPingLatency.value = null
      errorMessage.value = null
    }
  }

  async function ping(): Promise<number | null> {
    if (connectionState.value !== 'Online' || isPinging.value) return null
    isPinging.value = true
    errorMessage.value = null
    startTransaction('ping', 'Ping Hardware', 'Transmitting CMD_PING (0x01)...')

    try {
      updateTransaction('awaiting_ack', 'Awaiting PONG (0x81) from ESP32...', 60)
      const latency = await apiPingDevice()
      lastPingLatency.value = latency
      completeTransaction(`✓ Pong ACK: ${latency}ms latency`)
      return latency
    } catch (e) {
      errorMessage.value = `Ping failed: ${e}`
      connectionState.value = 'Error'
      failTransaction(`Ping failed: ${e}`)
      return null
    } finally {
      isPinging.value = false
    }
  }

  async function clear() {
    activeFrame.value = new Uint8Array(1024)
    if (connectionState.value !== 'Online' || isClearing.value) return
    isClearing.value = true
    errorMessage.value = null
    startTransaction('clear_display', 'Clear Display', 'Preparing CMD_CLEAR_DISPLAY (0x04)...')

    try {
      updateTransaction('transmitting', `Transmitting clear command to ${selectedPort.value}...`, 45)
      setTimeout(() => {
        if (activeTransaction.value?.step === 'transmitting') {
          updateTransaction('awaiting_ack', 'Flushing OLED GDDRAM...', 80)
        }
      }, 25)

      await apiClearDisplay()
      completeTransaction(`✓ OLED screen & buffer cleared (${activeTransaction.value?.elapsedMs || 0}ms)`)
    } catch (e) {
      const errStr = `Clear display failed: ${e}`
      errorMessage.value = errStr
      connectionState.value = 'Error'
      failTransaction(errStr)
      throw e
    } finally {
      isClearing.value = false
    }
  }

  async function sendCurrentFrame(data?: Uint8Array) {
    const frameToSend = data || activeFrame.value
    if (!frameToSend || frameToSend.length !== 1024) {
      errorMessage.value = 'Invalid frame data: expected exactly 1024 bytes.'
      return
    }

    activeFrame.value = new Uint8Array(frameToSend)

    if (connectionState.value !== 'Online') {
      errorMessage.value = 'Cannot send frame: ESP32 is disconnected.'
      return
    }

    errorMessage.value = null
    startTransaction('send_frame', 'Send Frame to OLED', 'Validating 1,024 B canonical frame & CRC...', 1024)

    try {
      updateTransaction(
        'transmitting',
        `Streaming 1,024 B over ${selectedPort.value} (${baudRate.value} baud)...`,
        45,
        512
      )

      setTimeout(() => {
        if (activeTransaction.value?.step === 'transmitting') {
          updateTransaction('awaiting_ack', 'Awaiting ESP32 Frame ACK (0x83) & OLED I²C refresh...', 80, 1024)
        }
      }, 30)

      await apiSendFrame(activeFrame.value)
      completeTransaction(`✓ 1,024 B rendered to OLED (${activeTransaction.value?.elapsedMs || 0}ms)`)
    } catch (e) {
      const errStr = `Send frame failed: ${e}`
      errorMessage.value = errStr
      connectionState.value = 'Error'
      failTransaction(errStr)
      throw e
    }
  }

  async function sendTestPattern() {
    errorMessage.value = null
    startTransaction('test_pattern', 'Send Test Pattern', 'Generating deterministic 1,024 B test pattern...', 1024)

    try {
      const pattern = await apiGetTestPattern()
      activeFrame.value = new Uint8Array(pattern)

      if (connectionState.value === 'Online') {
        updateTransaction('transmitting', `Streaming test grid to ${selectedPort.value}...`, 50, 1024)
        setTimeout(() => {
          if (activeTransaction.value?.step === 'transmitting') {
            updateTransaction('awaiting_ack', 'Awaiting Frame ACK (0x83)...', 80, 1024)
          }
        }, 30)

        await apiSendFrame(activeFrame.value)
        completeTransaction(`✓ Test pattern displayed on OLED (${activeTransaction.value?.elapsedMs || 0}ms)`)
      } else {
        completeTransaction('✓ Test pattern loaded into canvas preview')
      }
    } catch (e) {
      const errStr = `Test pattern error: ${e}`
      errorMessage.value = errStr
      failTransaction(errStr)
      throw e
    }
  }

  return {
    ports,
    selectedPort,
    baudRate,
    connectionState,
    activeTransaction,
    lastTransaction,
    status,
    deviceInfo,
    chipDossier,
    telemetry,
    lastPingLatency,
    errorMessage,
    activeFrame,
    autoReconnect,
    isPinging,
    isRebooting,
    isDisconnecting,
    isClearing,
    isRefreshingPorts,
    refreshPorts,
    connect,
    disconnect,
    ping,
    clear,
    sendCurrentFrame,
    sendTestPattern,
    fetchTelemetry,
    restart,
    startTransaction,
    updateTransaction,
    completeTransaction,
    failTransaction,
  }
})
