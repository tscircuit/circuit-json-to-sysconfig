import { type CircuitJson, type SourcePort, source_port } from "circuit-json"
import type { Cc2340Pin, Cc2340Target } from "../targets/cc2340r5rge"
import type { Cc2340GpioConfiguration } from "./configuration"
import { formatCc2340Pin } from "./format-pin-label"

export interface ResolvedCc2340Port {
  port: SourcePort
  pin: Cc2340Pin
  label: string
}

export function resolveCc2340Port(
  source_port_id: string,
  ctx: {
    circuitJson: CircuitJson
    source_component_id: string
    target: Cc2340Target
  },
): ResolvedCc2340Port {
  const ports = ctx.circuitJson.filter(
    (element) => element.type === "source_port",
  )
  const matches = ports.filter((port) => port.source_port_id === source_port_id)
  if (matches.length !== 1)
    throw new Error(
      `Expected exactly one MCU pin record; found ${matches.length}. Check the selected pin in the request and rebuild the circuit.`,
    )
  const port = source_port.parse(matches[0])
  const label = formatCc2340Pin(port, ctx)
  if (port.source_component_id !== ctx.source_component_id)
    throw new Error(
      `${label} does not belong to the selected MCU. Select a pin on that MCU.`,
    )
  const pin = ctx.target.gpioPins.find((pin) => pin.pin === port.pin_number)
  if (!pin)
    throw new Error(
      `Unsupported CC2340 physical pin ${port.pin_number}; a supported numeric RGE pin is required`,
    )
  for (const alias of new Set([port.name, ...(port.port_hints ?? [])])) {
    if (
      /^(?:pin)?\d+$/.test(alias) &&
      Number(alias.replace(/^pin/, "")) !== pin.pin
    )
      throw new Error(
        `${label}: numeric alias ${alias} contradicts physical pin ${pin.pin}`,
      )
    if (
      /^DIO/.test(alias) &&
      !pin.aliases.some((pinAlias) => pinAlias === alias)
    )
      throw new Error(
        `${label}: alias ${alias} contradicts physical pin ${pin.pin} (${pin.identifier})`,
      )
    if (/^(?:[A-HJ-NPRT-WY]|AA)(?:[1-9]|1[0-9]|2[01])$/.test(alias))
      throw new Error(
        `${label}: unsupported package alias ${alias}; CC2340 uses numeric RGE pins`,
      )
  }
  for (const other of ports) {
    if (
      other.source_component_id !== port.source_component_id ||
      other.source_port_id === source_port_id
    )
      continue
    const labels = [other.name, ...(other.port_hints ?? [])]
    if (
      other.pin_number === pin.pin ||
      labels.some(
        (label) =>
          pin.aliases.some((alias) => alias === label) ||
          label === `pin${pin.pin}` ||
          label === String(pin.pin),
      )
    )
      throw new Error(
        `Conflicting pin identity: ${label} and ${formatCc2340Pin(other, ctx)} claim the same physical pin. Correct the chip pinLabels/pinAttributes and rebuild the circuit.`,
      )
  }
  return { port, pin, label }
}

export function checkCc2340Function(
  resolved: ResolvedCc2340Port,
  request: Cc2340GpioConfiguration | "sda" | "scl",
) {
  const { port, label } = resolved
  const role = typeof request === "string" ? request : "gpio"
  const forbidden: (keyof SourcePort)[] = [
    "is_configured_for_spi_mosi",
    "is_configured_for_spi_miso",
    "is_configured_for_spi_sck",
    "is_configured_for_spi_cs",
    "is_configured_for_uart_tx",
    "is_configured_for_uart_rx",
    "do_not_connect",
    "provides_power",
    "requires_power",
    "provides_ground",
    "requires_ground",
    "is_passive",
    "is_using_tri_state",
    "is_using_open_collector",
    "is_using_open_emitter",
  ]
  // TI's I2CLPF3 driver configures both pins with GPIO_CFG_OUT_OD_PU.
  // Open drain is compatible with I2C, but not our standard GPIO output mode.
  if (role === "gpio") {
    forbidden.push("is_using_open_drain", "is_bidirectional")
    if (typeof request !== "string")
      forbidden.push(request.direction === "input" ? "is_output" : "is_input")
  } else {
    // I2C is bidirectional; a single GPIO direction would conflict with the driver.
    forbidden.push("is_input", "is_output")
  }
  // A GPIO declaration is compatible only if the emitted configuration agrees.
  if (
    typeof request === "string" ||
    request.direction !== "input" ||
    request.pull !== "up"
  )
    forbidden.push("is_using_internal_pullup")
  if (
    typeof request === "string" ||
    request.direction !== "input" ||
    request.pull !== "down"
  )
    forbidden.push("is_using_internal_pulldown")
  if (typeof request === "string" || request.direction !== "output")
    forbidden.push("is_using_push_pull")
  if (role !== "sda") forbidden.push("is_configured_for_i2c_sda")
  if (role !== "scl") forbidden.push("is_configured_for_i2c_scl")
  const conflict = forbidden.find((attribute) => port[attribute] === true)
  if (conflict)
    throw new Error(
      `${label}: ${conflict} conflicts with requested ${role} function. Correct the conflicting declaration in TSX pinAttributes.`,
    )
}
