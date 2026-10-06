import type { CircuitJson, SourcePort, SourceSimpleChip } from "circuit-json"
import type { Cc2340Target } from "../targets/cc2340r5rge"
import type { Cc2340GpioConfiguration } from "./configuration"
import { formatCc2340Component, formatCc2340Pin } from "./format-pin-label"
import { resolveCc2340LfCrystal } from "./resolve-lf-crystal"
import {
  checkCc2340Function,
  type ResolvedCc2340Port,
  resolveCc2340Port,
} from "./resolve-port"
import type { ResolvedCc2340Requests } from "./resolve-requests"
import { resolveCc2340SourcePorts } from "./resolve-source-ports"

const unsupportedFunctions: (keyof SourcePort)[] = [
  "is_configured_for_spi_mosi",
  "is_configured_for_spi_miso",
  "is_configured_for_spi_sck",
  "is_configured_for_spi_cs",
  "is_configured_for_uart_tx",
  "is_configured_for_uart_rx",
]
const selectedElectricalModes: (keyof SourcePort)[] = [
  "is_using_internal_pullup",
  "is_using_internal_pulldown",
  "is_using_open_drain",
  "is_using_push_pull",
  "is_using_tri_state",
  "is_using_open_collector",
  "is_using_open_emitter",
]

/** Derive only declarations already represented by Circuit JSON. Never infer behavior from net names. */
export function deriveCc2340Requests(
  component: SourceSimpleChip,
  ctx: { circuitJson: CircuitJson; target: Cc2340Target },
): ResolvedCc2340Requests {
  const ports = resolveCc2340SourcePorts(component, ctx)
  const componentIdentity = formatCc2340Component(component)
  const connectedIds = new Set(
    ctx.circuitJson.flatMap((element) =>
      element.type === "source_trace" ? element.connected_source_port_ids : [],
    ),
  )
  const resolved: ResolvedCc2340Requests = { target: ctx.target, gpios: [] }
  resolved.lfCrystal = resolveCc2340LfCrystal(ports, ctx)
  const missing: string[] = []
  const sdaPorts: ResolvedCc2340Port[] = []
  const sclPorts: ResolvedCc2340Port[] = []
  const portContext = {
    ...ctx,
    source_component_id: component.source_component_id,
  }
  const portIds = new Set<string>()
  const namePrefix = `CONFIG_${component.name.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`
  for (const port of ports) {
    const identity = formatCc2340Pin(port, ctx)
    if (portIds.has(port.source_port_id))
      throw new Error(
        `Duplicate pin record for ${identity}. Rebuild the circuit before generating SysConfig.`,
      )
    portIds.add(port.source_port_id)
    const unsupported = unsupportedFunctions.find(
      (attribute) => port[attribute] === true,
    )
    if (unsupported)
      throw new Error(
        `${identity}: activeCapability: "${unsupported.replace("is_configured_for_", "")}" is unsupported by SysConfig export. Only GPIO and I2C functions are currently supported; keep the intended function and add converter support before exporting.`,
      )
    const isSda = port.is_configured_for_i2c_sda === true
    const isScl = port.is_configured_for_i2c_scl === true
    const selectedGpio = port.is_input === true || port.is_output === true
    const selectedElectricalMode = selectedElectricalModes.some(
      (attribute) => port[attribute] === true,
    )
    const connected = connectedIds.has(port.source_port_id)
    if (
      port.pin_number === undefined ||
      !Number.isInteger(port.pin_number) ||
      port.pin_number < 1 ||
      port.pin_number > 25
    ) {
      if (
        connected ||
        selectedGpio ||
        isSda ||
        isScl ||
        selectedElectricalMode ||
        port.is_gpio === true
      )
        throw new Error(
          `${identity}: a numeric RGE physical pin in 1..25 is required`,
        )
      continue
    }
    if (!ctx.target.gpioPins.some((pin) => pin.pin === port.pin_number)) {
      if (
        isSda ||
        isScl ||
        port.is_gpio === true ||
        (selectedElectricalMode && port.is_output === true)
      )
        throw new Error(
          `${identity}: no supported GPIO/I2C physical pin identity`,
        )
      continue // Fixed-function power, reset, RF and oscillator pins are not GPIO instances.
    }
    const physical = resolveCc2340Port(port.source_port_id, portContext)
    // Preserve the SDK's SWD reset settings unless the circuit selects a function.
    if (
      ctx.target.defaultDebugPins.some((pin) => pin === physical.pin.pin) &&
      !selectedGpio &&
      !isSda &&
      !isScl &&
      !selectedElectricalMode
    ) {
      continue
    }
    if (ctx.target.lfCrystalPins.some((pin) => pin === physical.pin.pin)) {
      if (
        selectedGpio ||
        isSda ||
        isScl ||
        selectedElectricalMode ||
        port.do_not_connect ||
        port.requires_power ||
        port.provides_power ||
        port.requires_ground ||
        port.provides_ground
      )
        missing.push(
          `${identity}: LF crystal pins have a conflicting GPIO, peripheral, or electrical declaration`,
        )
      else if (connected && !resolved.lfCrystal)
        missing.push(
          `${identity}: SDK LF crystal ownership is unresolved; do not assume an internal clock or GPIO function`,
        )
      continue
    }
    if (isSda && isScl)
      throw new Error(`${identity}: both I2C SDA and SCL are selected`)
    if (isSda || isScl) {
      checkCc2340Function(physical, isSda ? "sda" : "scl")
      if (isSda) sdaPorts.push(physical)
      else sclPorts.push(physical)
      continue
    }
    if (!connected && !selectedGpio && !selectedElectricalMode) continue
    if (
      port.is_input === port.is_output ||
      (!port.is_input && !port.is_output)
    ) {
      missing.push(
        `${identity}: ${port.is_input && port.is_output ? "both isInput and isOutput are selected" : "no GPIO direction or supported peripheral selected"}`,
      )
      continue
    }
    const request: Cc2340GpioConfiguration = port.is_output
      ? {
          source_port_id: port.source_port_id,
          gpio_name: `${namePrefix}_PIN${physical.pin.pin}`,
          direction: "output",
        }
      : {
          source_port_id: port.source_port_id,
          gpio_name: `${namePrefix}_PIN${physical.pin.pin}`,
          direction: "input",
          pull: resolvePull(physical),
        }
    checkCc2340Function(physical, request)
    resolved.gpios.push({ request, pin: physical.pin })
  }
  if (missing.length)
    throw new Error(
      `Unresolved CC2340 pin configuration for ${componentIdentity}:\n${missing.map((problem) => `- ${problem}`).join("\n")}\nUpdate ${component.name}'s TSX pinAttributes with the intended function for each listed pin: set exactly one of isInput: true or isOutput: true for GPIO, or activeCapability: "i2c_sda" / "i2c_scl" for I2C.\nDatasheet capabilities such as isGpio and isBidirectional describe what a pin supports; they do not select how this board uses it.`,
    )
  if (sdaPorts.length || sclPorts.length) {
    const sda = sdaPorts[0]
    const scl = sclPorts[0]
    if (sdaPorts.length !== 1 || sclPorts.length !== 1 || !sda || !scl)
      throw new Error(
        `${componentIdentity}: expected exactly one selected I2C SDA and SCL; found ${sdaPorts.length} SDA and ${sclPorts.length} SCL. Declare both endpoints with activeCapability: "i2c_sda"/"i2c_scl" in TSX pinAttributes. Selected pins: ${[...sdaPorts, ...sclPorts].map(({ port }) => formatCc2340Pin(port, ctx)).join(", ")}`,
      )
    if (
      !ctx.target.i2c.sdaPins.some((pin) => pin === sda.pin.pin) ||
      !ctx.target.i2c.sclPins.some((pin) => pin === scl.pin.pin)
    )
      throw new Error(
        `Unsupported I2C0 pin pair: ${formatCc2340Pin(sda.port, ctx)} / ${formatCc2340Pin(scl.port, ctx)}; supported SDA pin ${ctx.target.i2c.sdaPins.join(", ")} and SCL pin ${ctx.target.i2c.sclPins.join(", ")}`,
      )
    resolved.i2c = {
      request: {
        i2c_name: `${namePrefix}_I2C0`,
        sda_source_port_id: sda.port.source_port_id,
        scl_source_port_id: scl.port.source_port_id,
        peripheral_assignment: "fixed",
      },
      sda: sda.pin,
      scl: scl.pin,
    }
  }
  if (!resolved.gpios.length && !resolved.i2c)
    throw new Error(
      `${componentIdentity}: no configured CC2340 GPIO/I2C pins. Declare a supported function in TSX pinAttributes: exactly one of isInput/isOutput for GPIO, or activeCapability: "i2c_sda"/"i2c_scl" for I2C. Capability flags alone do not activate peripherals`,
    )
  return resolved
}

function resolvePull({
  port,
  label,
}: ResolvedCc2340Port): "up" | "down" | "none" | undefined {
  if (port.is_using_internal_pullup && port.is_using_internal_pulldown)
    throw new Error(
      `${label}: both internal pull-up and pull-down are selected. Set only one of isUsingInternalPullup / isUsingInternalPulldown in TSX pinAttributes.`,
    )
  if (port.is_using_internal_pullup) return "up"
  if (port.is_using_internal_pulldown) return "down"
  if (
    port.is_using_internal_pullup === false ||
    port.is_using_internal_pulldown === false
  )
    return "none"
  return undefined
}
