/**
 * Electrical Constraint Linter Engine (Spec 008)
 * Real-time deterministic rule engine checking pin capabilities, bus conflicts,
 * strapping pin hazards, voltage mismatch, and power budget limits.
 */

import type { BoardProfile, PinDefinition } from '../../types/hardware'
import { getComponentDefinition } from './ComponentDefinition'
import type { PlottedComponent, WireNet } from './Netlist'

export type LintSeverity = 'error' | 'warning' | 'advisory'

export interface LintIssue {
  id: string
  severity: LintSeverity
  ruleId: string
  title: string
  message: string
  componentInstanceId?: string
  pinId?: string
  boardPinLabel?: string
}

export interface LintReport {
  isValid: boolean
  hasErrors: boolean
  hasWarnings: boolean
  issues: LintIssue[]
  totalCurrentMa: number
  maxLdoCurrentMa: number
  connectedComponentsCount: number
  totalWiresCount: number
}

const ESP32_LDO_MAX_MA = 500
const ESP32_LDO_WARN_MA = 450
const STRAPPING_GPIOS = [0, 2, 12, 15]
const INPUT_ONLY_GPIOS = [34, 35, 36, 39]
const FLASH_GPIOS = [6, 7, 8, 9, 10, 11]

export class ElectricalLinter {
  /**
   * Run a full validation pass on the active circuit
   */
  public static evaluate(
    board: BoardProfile,
    components: PlottedComponent[],
    nets: WireNet[]
  ): LintReport {
    const issues: LintIssue[] = []
    const allBoardPins = [...board.left_header, ...board.right_header]

    // Fast lookup for board pins
    const boardPinMap = new Map<string, PinDefinition>()
    for (const p of allBoardPins) {
      boardPinMap.set(p.label, p)
      if (p.gpio !== null) {
        boardPinMap.set(`GPIO_${p.gpio}`, p)
        boardPinMap.set(`D${p.gpio}`, p)
        boardPinMap.set(`P${p.gpio}`, p)
      }
    }

    // Helper to find board pin definition
    const resolveBoardPin = (pinId: string): PinDefinition | undefined => {
      if (boardPinMap.has(pinId)) return boardPinMap.get(pinId)
      // Pattern match
      const m = pinId.match(/(?:GPIO|P|D)(\d+)/i)
      if (m) {
        const gpioNum = parseInt(m[1], 10)
        return allBoardPins.find((p) => p.gpio === gpioNum)
      }
      if (pinId.includes('3V3')) return allBoardPins.find((p) => p.capabilities.includes('power_3v3'))
      if (pinId.includes('5V') || pinId.includes('VIN')) return allBoardPins.find((p) => p.capabilities.includes('power_5v'))
      if (pinId === 'GND' || pinId.startsWith('GND')) return allBoardPins.find((p) => p.capabilities.includes('gnd'))
      return allBoardPins.find((p) => p.label.startsWith(pinId))
    }

    // 1. Calculate Power Budget
    let totalCurrentMa = 0
    for (const comp of components) {
      const def = getComponentDefinition(comp.definitionId)
      if (def) {
        totalCurrentMa += def.estimatedCurrentMa
      }
    }

    if (totalCurrentMa > ESP32_LDO_MAX_MA) {
      issues.push({
        id: 'power-budget-exceeded',
        severity: 'error',
        ruleId: 'RULE_5_POWER_BUDGET',
        title: 'Power Budget Exceeded',
        message: `Total estimated peripheral load is ${totalCurrentMa} mA, exceeding the onboard 3.3V LDO regulator limit of ${ESP32_LDO_MAX_MA} mA. An external power supply is required.`,
      })
    } else if (totalCurrentMa > ESP32_LDO_WARN_MA) {
      issues.push({
        id: 'power-budget-warning',
        severity: 'warning',
        ruleId: 'RULE_5_POWER_BUDGET',
        title: 'High Current Load Warning',
        message: `Total estimated load is ${totalCurrentMa} mA, nearing the 450 mA recommended safety threshold of the ESP32 LDO.`,
      })
    }

    // 2. Build pin-to-nets mappings
    // Map of (instanceId:pinId) -> list of nets it belongs to
    const nodeToNets = new Map<string, WireNet[]>()
    for (const net of nets) {
      for (const node of net.nodes) {
        const key = `${node.instanceId}:${node.pinId}`
        const existing = nodeToNets.get(key) || []
        existing.push(net)
        nodeToNets.set(key, existing)
      }
    }

    // Map each net to its endpoints
    // Which board pins are connected to which peripheral pins?
    for (const net of nets) {
      const boardNodes = net.nodes.filter((n) => n.instanceId === 'esp32')
      const periphNodes = net.nodes.filter((n) => n.instanceId !== 'esp32')

      for (const bNode of boardNodes) {
        const pinDef = resolveBoardPin(bNode.pinId)
        if (!pinDef) continue

        // Rule 6: SPI Flash pins (GPIO 6-11)
        if (pinDef.gpio !== null && (FLASH_GPIOS.includes(pinDef.gpio) || pinDef.capabilities.includes('flash_reserved'))) {
          issues.push({
            id: `rule-flash-pin-${pinDef.label}`,
            severity: 'error',
            ruleId: 'RULE_6_FLASH_PIN',
            title: `Reserved Flash Pin Hazard: ${pinDef.label}`,
            message: `Pin ${pinDef.label} (GPIO ${pinDef.gpio}) is reserved for internal SPI flash memory. External connections will cause immediate MCU reboot loop!`,
            boardPinLabel: pinDef.label,
          })
        }

        // Rule 2: Strapping pin warnings (GPIO 0, 2, 12, 15)
        if (pinDef.gpio !== null && (STRAPPING_GPIOS.includes(pinDef.gpio) || pinDef.is_strapping)) {
          issues.push({
            id: `rule-strapping-${pinDef.label}`,
            severity: 'warning',
            ruleId: 'RULE_2_STRAPPING_PIN',
            title: `Strapping Pin Advisory: ${pinDef.label}`,
            message: `${pinDef.label} (GPIO ${pinDef.gpio}) is a hardware strapping pin. External pull resistors or components connected to this pin may alter ESP32 boot mode or prevent flashing.`,
            boardPinLabel: pinDef.label,
          })
        }

        // For each peripheral node on this net
        for (const pNode of periphNodes) {
          const comp = components.find((c) => c.instanceId === pNode.instanceId)
          if (!comp) continue
          const def = getComponentDefinition(comp.definitionId)
          if (!def) continue
          const pin = def.pins.find((p) => p.id === pNode.pinId)
          if (!pin) continue

          // Rule 1: Voltage Level Protection
          const is5vRail = pinDef.capabilities.includes('power_5v') || pinDef.label.includes('5V') || pinDef.label.includes('VIN')
          const is3v3Rail = pinDef.capabilities.includes('power_3v3') || pinDef.label.includes('3V3')

          if (pin.type === 'POWER_IN') {
            if (pin.requiredVoltage === 3.3 && is5vRail) {
              issues.push({
                id: `rule-voltage-3v3-to-5v-${comp.instanceId}`,
                severity: 'error',
                ruleId: 'RULE_1_VOLTAGE_PROTECTION',
                title: `Voltage Violation: 3.3V on 5V Rail`,
                message: `Component "${comp.name}" requires 3.3V VCC. Connection to 5V (VIN) rail may permanently damage the silicon!`,
                componentInstanceId: comp.instanceId,
                pinId: pin.id,
                boardPinLabel: pinDef.label,
              })
            } else if (pin.requiredVoltage === 5.0 && is3v3Rail) {
              issues.push({
                id: `rule-voltage-5v-to-3v3-${comp.instanceId}`,
                severity: 'warning',
                ruleId: 'RULE_1_VOLTAGE_PROTECTION',
                title: `Under-Voltage Advisory: 5V Device on 3.3V Rail`,
                message: `Component "${comp.name}" expects 5V rail. Running on 3.3V may cause unstable logic or brownouts.`,
                componentInstanceId: comp.instanceId,
                pinId: pin.id,
                boardPinLabel: pinDef.label,
              })
            }
          }

          // Rule 3: Input-Only Pin Guard (GPIO 34, 35, 36, 39)
          if (pinDef.gpio !== null && INPUT_ONLY_GPIOS.includes(pinDef.gpio)) {
            const isOutputSignal =
              pin.direction === 'output' ||
              pin.type === 'I2C_SCL' ||
              pin.type === 'I2C_SDA' ||
              pin.type === 'SPI_MOSI' ||
              pin.type === 'SPI_SCK' ||
              pin.type === 'SPI_CS' ||
              pin.id === 'DIN' ||
              pin.id === 'LED'

            if (isOutputSignal) {
              issues.push({
                id: `rule-input-only-violation-${comp.instanceId}-${pin.id}`,
                severity: 'error',
                ruleId: 'RULE_3_INPUT_ONLY_PIN',
                title: `Output Driven on Input-Only Pin (${pinDef.label})`,
                message: `Signal "${pin.label}" on "${comp.name}" requires bidirectional or output driving. Pin ${pinDef.label} (GPIO ${pinDef.gpio}) is pure input silicon and lacks output push-pull drivers.`,
                componentInstanceId: comp.instanceId,
                pinId: pin.id,
                boardPinLabel: pinDef.label,
              })
            }
          }
        }
      }
    }

    // Rule 4: I²C Bus Address Collisions
    // Find all I2C devices wired to the same SDA / SCL bus
    const i2cDevices = components.filter((c) => {
      const def = getComponentDefinition(c.definitionId)
      return def && def.pins.some((p) => p.type === 'I2C_SDA')
    })

    if (i2cDevices.length > 1) {
      // Group by I2C address
      const addrMap = new Map<number, PlottedComponent[]>()
      for (const dev of i2cDevices) {
        const def = getComponentDefinition(dev.definitionId)
        const addr = dev.i2cAddress || def?.i2cAddress || 0x3c
        const group = addrMap.get(addr) || []
        group.push(dev)
        addrMap.set(addr, group)
      }

      for (const [addr, group] of addrMap.entries()) {
        if (group.length > 1) {
          const names = group.map((g) => `"${g.name}"`).join(' and ')
          const hexAddr = `0x${addr.toString(16).toUpperCase()}`
          issues.push({
            id: `rule-i2c-collision-${addr}`,
            severity: 'error',
            ruleId: 'RULE_4_I2C_COLLISION',
            title: `I²C Bus Address Collision (${hexAddr})`,
            message: `Multiple I²C peripherals (${names}) share address ${hexAddr} on the same bus. Reconfigure the solder address jumper on one device or use separate pins.`,
          })
        }
      }
    }

    // Rule 7: Missing Essential Connections for Displays
    for (const comp of components) {
      const def = getComponentDefinition(comp.definitionId)
      if (!def) continue

      if (def.category === 'Display') {
        const sdaNet = nets.find((n) => n.nodes.some((node) => node.instanceId === comp.instanceId && node.pinId === 'SDA'))
        const sclNet = nets.find((n) => n.nodes.some((node) => node.instanceId === comp.instanceId && node.pinId === 'SCL'))
        const vccNet = nets.find((n) => n.nodes.some((node) => node.instanceId === comp.instanceId && (node.pinId === 'VCC' || node.pinId === '3V3')))
        const gndNet = nets.find((n) => n.nodes.some((node) => node.instanceId === comp.instanceId && node.pinId === 'GND'))

        const missing: string[] = []
        if (!vccNet) missing.push('VCC')
        if (!gndNet) missing.push('GND')
        if (!sdaNet) missing.push('SDA')
        if (!sclNet) missing.push('SCL')

        if (missing.length > 0) {
          issues.push({
            id: `rule-incomplete-display-${comp.instanceId}`,
            severity: 'warning',
            ruleId: 'RULE_7_INCOMPLETE_WIRING',
            title: `Incomplete Wiring: ${comp.name}`,
            message: `Display requires connections for: ${missing.join(', ')} before it can operate.`,
            componentInstanceId: comp.instanceId,
          })
        }
      }
    }

    const hasErrors = issues.some((i) => i.severity === 'error')
    const hasWarnings = issues.some((i) => i.severity === 'warning')

    return {
      isValid: !hasErrors,
      hasErrors,
      hasWarnings,
      issues,
      totalCurrentMa,
      maxLdoCurrentMa: ESP32_LDO_MAX_MA,
      connectedComponentsCount: components.length,
      totalWiresCount: nets.length,
    }
  }
}
