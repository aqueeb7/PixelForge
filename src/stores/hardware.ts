import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  BoardProfile,
  HardwareConfig,
  HardwareConnection,
  PeripheralDevice,
  PinAssignmentInfo,
  PinDefinition,
  ValidationIssue,
} from '../types/hardware'
import { DEFAULT_HARDWARE_CONFIG, STANDARD_BOARD_PROFILES } from '../services/boardProfiles'
import { getBoardProfiles, getHardwareConfig, saveHardwareConfig } from '../services/platform'

export const useHardwareStore = defineStore('hardware', () => {
  const boards = ref<BoardProfile[]>(STANDARD_BOARD_PROFILES)
  const selectedBoardId = ref<string>('esp32-devkit-v1-38p')
  const peripherals = ref<PeripheralDevice[]>(JSON.parse(JSON.stringify(DEFAULT_HARDWARE_CONFIG.peripherals)))
  const connections = ref<HardwareConnection[]>(JSON.parse(JSON.stringify(DEFAULT_HARDWARE_CONFIG.connections || [])))
  
  const selectedPin = ref<PinDefinition | null>(null)
  const hoveredPin = ref<PinDefinition | null>(null)
  const hoveredEndpoint = ref<{ componentId: string; pinId?: string } | null>(null)
  const isSaving = ref<boolean>(false)
  const lastSaved = ref<Date | null>(null)
  const errorMessage = ref<string | null>(null)

  // Active Board Profile
  const activeBoard = computed<BoardProfile>(() => {
    return boards.value.find((b) => b.id === selectedBoardId.value) || boards.value[0] || STANDARD_BOARD_PROFILES[0]
  })

  // All pins of active board flat list
  const allPins = computed<PinDefinition[]>(() => {
    return [...activeBoard.value.left_header, ...activeBoard.value.right_header]
  })


  // Helper to find a pin definition by its label or alias
  function findPinByLabel(label: string): PinDefinition | undefined {
    if (!label) return undefined
    // 1. Exact match
    const exact = allPins.value.find((p) => p.label === label)
    if (exact) return exact

    // 2. Extract GPIO number if any (e.g. "D21 (SDA)" <-> "P21 (SDA)" or "GPIO21")
    const gpioMatch = label.match(/(?:GPIO|P|D)(\d+)/i)
    if (gpioMatch) {
      const gNum = parseInt(gpioMatch[1], 10)
      const byGpio = allPins.value.find((p) => p.gpio === gNum)
      if (byGpio) return byGpio
    }

    // 3. Match power & ground
    if (label.includes('3V3')) return allPins.value.find((p) => p.capabilities.includes('power_3v3'))
    if (label.includes('5V') || label.includes('VIN')) return allPins.value.find((p) => p.capabilities.includes('power_5v'))
    if (label === 'GND' || label.startsWith('GND')) return allPins.value.find((p) => p.capabilities.includes('gnd'))

    // 4. Prefix match
    return allPins.value.find((p) => p.label.startsWith(label) || label.startsWith(p.label))
  }

  // Map of pinLabel -> list of assignments
  const pinAssignments = computed<Map<string, PinAssignmentInfo[]>>(() => {
    const map = new Map<string, PinAssignmentInfo[]>()

    for (const p of peripherals.value) {
      for (const [role, pinLabel] of Object.entries(p.pins)) {
        if (!pinLabel) continue
        const item: PinAssignmentInfo = {
          peripheralId: p.id,
          peripheralName: p.name,
          peripheralType: p.type,
          role,
        }

        // Add to stored label
        const existingStored = map.get(pinLabel) || []
        existingStored.push(item)
        map.set(pinLabel, existingStored)

        // Also add to active board pin label if different (e.g. D21 vs P21)
        const boardPin = findPinByLabel(pinLabel)
        if (boardPin && boardPin.label !== pinLabel) {
          const existingBoard = map.get(boardPin.label) || []
          if (!existingBoard.some((x) => x.peripheralId === p.id && x.role === role)) {
            existingBoard.push(item)
            map.set(boardPin.label, existingBoard)
          }
        }
      }
    }

    return map
  })

  // ----------------------------------------------------------------------------
  // Connection Graph & Bidirectional Linking
  // ----------------------------------------------------------------------------

  // Find all active connections matching the hovered target or hovered pin
  const activeConnections = computed<HardwareConnection[]>(() => {
    const ep = hoveredEndpoint.value
    if (ep) {
      return connections.value.filter((conn) => {
        // Direct component match (e.g. hovered OLED card -> match all 4 pins)
        if (ep.componentId && !ep.pinId) {
          return conn.source.componentId === ep.componentId || conn.target.componentId === ep.componentId
        }
        // Specific endpoint match (e.g. hovered OLED.SDA -> match only SDA connection)
        if (ep.componentId && ep.pinId) {
          const matchSource = conn.source.componentId === ep.componentId && conn.source.pinId === ep.pinId
          const matchTarget = conn.target.componentId === ep.componentId && conn.target.pinId === ep.pinId
          return matchSource || matchTarget
        }
        return false
      })
    }

    // If hovering a board pin on Esp32BoardView
    if (hoveredPin.value) {
      const pinLabel = hoveredPin.value.label
      const gpio = hoveredPin.value.gpio
      return connections.value.filter((conn) => {
        const targetPin = conn.target.pinId
        if (targetPin === pinLabel) return true
        if (gpio !== null && targetPin.includes(String(gpio))) return true
        if (pinLabel.includes('3V3') && targetPin.includes('3V3')) return true
        if (pinLabel.startsWith('GND') && targetPin === 'GND') return true
        return false
      })
    }

    return []
  })

  // Board pin labels illuminated by the active connections
  const highlightedBoardPinLabels = computed<string[]>(() => {
    const labels = new Set<string>()
    for (const conn of activeConnections.value) {
      if (conn.target.componentId === 'esp32-mcu') {
        labels.add(conn.target.pinId)
      }
    }
    return Array.from(labels)
  })

  // Peripheral endpoints illuminated by the active connections (componentId -> Set of pinIds)
  const highlightedEndpoints = computed<Map<string, Set<string>>>(() => {
    const map = new Map<string, Set<string>>()
    for (const conn of activeConnections.value) {
      if (conn.source.componentId) {
        if (!map.has(conn.source.componentId)) {
          map.set(conn.source.componentId, new Set())
        }
        map.get(conn.source.componentId)!.add(conn.source.pinId)
      }
    }
    return map
  })

  function setHoveredEndpoint(componentId: string, pinId?: string) {
    hoveredEndpoint.value = { componentId, pinId }
  }

  function clearHoveredEndpoint() {
    hoveredEndpoint.value = null
  }

  // Safety Validation Engine
  const validationIssues = computed<ValidationIssue[]>(() => {
    const issues: ValidationIssue[] = []

    // 1. Check for duplicate/conflicting pin assignments
    const pinUsage = new Map<string, { peripheralId: string; role: string; type: string }[]>()
    for (const p of peripherals.value) {
      for (const [role, pinLabel] of Object.entries(p.pins)) {
        if (!pinLabel) continue
        const list = pinUsage.get(pinLabel) || []
        list.push({ peripheralId: p.id, role, type: p.type })
        pinUsage.set(pinLabel, list)
      }
    }

    for (const [pinLabel, usages] of pinUsage.entries()) {
      // Power (3V3, VIN) and GND can be shared. I2C SDA/SCL can be shared across distinct I2C devices.
      const isPowerOrGnd = pinLabel.includes('3V3') || pinLabel.includes('5V') || pinLabel.includes('VIN') || pinLabel.includes('GND')
      const isI2cBus = pinLabel.includes('SDA') || pinLabel.includes('SCL')

      if (usages.length > 1 && !isPowerOrGnd) {
        if (isI2cBus) {
          // All must be I2C roles
          const nonI2c = usages.some((u) => u.role !== 'SDA' && u.role !== 'SCL')
          if (nonI2c) {
            issues.push({
              id: `conflict-${pinLabel}`,
              severity: 'error',
              title: `Pin Conflict on ${pinLabel}`,
              message: `Multiple peripherals with conflicting roles share ${pinLabel}.`,
              pinLabel,
            })
          }
        } else {
          issues.push({
            id: `conflict-${pinLabel}`,
            severity: 'error',
            title: `Exclusive Pin Conflict on ${pinLabel}`,
            message: `${usages.length} peripherals are assigned to the same exclusive GPIO: ${pinLabel}.`,
            pinLabel,
          })
        }
      }
    }

    // 2. Check input-only pins (GPIO 34, 35, 36, 39) & flash pins (GPIO 6-11)
    for (const p of peripherals.value) {
      for (const [role, pinLabel] of Object.entries(p.pins)) {
        const pinDef = findPinByLabel(pinLabel)
        if (!pinDef || pinDef.gpio === null) continue

        // Flash memory pins
        if (pinDef.capabilities.includes('flash_reserved')) {
          issues.push({
            id: `flash-${p.id}-${role}`,
            severity: 'error',
            title: `Critical: Internal SPI Flash Pin (${pinLabel})`,
            message: `Peripheral "${p.name}" assigned role "${role}" to ${pinLabel} (GPIO ${pinDef.gpio}), which is connected to internal SPI flash memory! Avoid using to prevent MCU crash.`,
            peripheralId: p.id,
            pinLabel,
          })
        }

        const isInputOnly = [34, 35, 36, 39].includes(pinDef.gpio)
        const isOutputRole = role === 'SCL' || role === 'SDA' || role === 'LED' || role === 'OUT' || role === 'MOSI' || role === 'SCK' || role === 'CS'

        if (isInputOnly && isOutputRole) {
          issues.push({
            id: `input-only-${p.id}-${role}`,
            severity: 'error',
            title: `Invalid Output on Input-Only Pin`,
            message: `Peripheral "${p.name}" assigned role "${role}" to ${pinLabel} (GPIO ${pinDef.gpio}), which cannot output signals.`,
            peripheralId: p.id,
            pinLabel,
          })
        }

        // 3. Strapping pin warnings (GPIO 0, 2, 12, 15, 5)
        if (pinDef.is_strapping) {
          issues.push({
            id: `strap-${p.id}-${role}`,
            severity: 'warning',
            title: `Strapping Pin Advisory: ${pinLabel}`,
            message: `${pinLabel} (GPIO ${pinDef.gpio}) is an ESP32 strapping pin. Ensure external circuitry does not pull it to an unintended state during boot.`,
            peripheralId: p.id,
            pinLabel,
          })
        }
      }
    }

    // 4. Missing required pins for OLED
    for (const p of peripherals.value) {
      if (p.type === 'OLED_128X64_I2C') {
        if (!p.pins['SDA'] || !p.pins['SCL']) {
          issues.push({
            id: `missing-oled-pins-${p.id}`,
            severity: 'warning',
            title: `Incomplete I²C OLED Assignment`,
            message: `OLED display "${p.name}" requires both SDA and SCL pin assignments.`,
            peripheralId: p.id,
          })
        }
      }
    }

    return issues
  })

  // Initialize from storage or backend
  async function init() {
    try {
      errorMessage.value = null
      const loadedBoards = await getBoardProfiles()
      if (loadedBoards && loadedBoards.length > 0) {
        boards.value = loadedBoards
      }

      const config = await getHardwareConfig()
      if (config) {
        if (config.board_id) selectedBoardId.value = config.board_id
        if (config.peripherals && config.peripherals.length > 0) {
          peripherals.value = config.peripherals
        }
        if (config.connections && config.connections.length > 0) {
          connections.value = config.connections
        }
      }
    } catch (e) {
      console.warn('Hardware store init fallback to default:', e)
    }
  }

  function selectBoard(boardId: string) {
    selectedBoardId.value = boardId
    selectedPin.value = null
    hoveredPin.value = null
  }

  function selectPin(pin: PinDefinition | null) {
    selectedPin.value = pin
  }

  function setHoveredPin(pin: PinDefinition | null) {
    hoveredPin.value = pin
  }

  function addPeripheral(device: PeripheralDevice) {
    peripherals.value.push(device)
  }

  function removePeripheral(id: string) {
    peripherals.value = peripherals.value.filter((p) => p.id !== id)
  }

  function updatePeripheralPin(peripheralId: string, role: string, pinLabel: string) {
    const target = peripherals.value.find((p) => p.id === peripheralId)
    if (target) {
      target.pins[role] = pinLabel
    }
  }

  async function save(): Promise<boolean> {
    isSaving.value = true
    errorMessage.value = null
    try {
      const config: HardwareConfig = {
        version: 1,
        board_id: activeBoard.value.id,
        board_name: activeBoard.value.name,
        peripherals: peripherals.value,
        connections: connections.value,
      }
      await saveHardwareConfig(config)
      lastSaved.value = new Date()
      return true
    } catch (e) {
      errorMessage.value = `Failed to save hardware config: ${e}`
      return false
    } finally {
      isSaving.value = false
    }
  }

  function resetToDefault() {
    peripherals.value = JSON.parse(JSON.stringify(DEFAULT_HARDWARE_CONFIG.peripherals))
    connections.value = JSON.parse(JSON.stringify(DEFAULT_HARDWARE_CONFIG.connections || []))
    selectedBoardId.value = DEFAULT_HARDWARE_CONFIG.board_id
    selectedPin.value = null
    hoveredEndpoint.value = null
  }

  return {
    boards,
    selectedBoardId,
    activeBoard,
    allPins,
    peripherals,
    connections,
    selectedPin,
    hoveredPin,
    hoveredEndpoint,
    activeConnections,
    highlightedBoardPinLabels,
    highlightedEndpoints,
    pinAssignments,
    validationIssues,
    isSaving,
    lastSaved,
    errorMessage,
    init,
    selectBoard,
    selectPin,
    setHoveredPin,
    setHoveredEndpoint,
    clearHoveredEndpoint,
    addPeripheral,
    removePeripheral,
    updatePeripheralPin,
    save,
    resetToDefault,
  }
})
