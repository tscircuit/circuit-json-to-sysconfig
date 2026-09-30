import { type CircuitJson, type SourcePort, source_port } from "circuit-json"
import type { Cc2340Pin, Cc2340Target } from "../targets/cc2340r5rge"
import type { Cc2340GpioRequest } from "./options"

export interface ResolvedCc2340Port {
  port: SourcePort
  pin: Cc2340Pin
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
      `Expected exactly one source_port ${source_port_id}; found ${matches.length}`,
    )
  const port = source_port.parse(matches[0])
  if (port.source_component_id !== ctx.source_component_id)
    throw new Error(
      `source_port ${source_port_id} does not belong to MCU ${ctx.source_component_id}`,
    )
  const pin = ctx.target.gpioPins.find((pin) => pin.pin === port.pin_number)
  if (!pin)
    throw new Error(
      `Unsupported CC2340 physical pin ${port.pin_number}; a supported numeric RGE pin is required`,
    )
  for (const label of new Set([port.name, ...(port.port_hints ?? [])])) {
    if (
      /^(?:pin)?\d+$/.test(label) &&
      Number(label.replace(/^pin/, "")) !== pin.pin
    )
      throw new Error(
        `source_port ${source_port_id}: numeric alias ${label} contradicts physical pin ${pin.pin}`,
      )
    if (/^DIO/.test(label) && !pin.aliases.some((alias) => alias === label))
      throw new Error(
        `source_port ${source_port_id}: alias ${label} contradicts physical pin ${pin.pin} (${pin.identifier})`,
      )
    if (/^(?:[A-HJ-NPRT-WY]|AA)(?:[1-9]|1[0-9]|2[01])$/.test(label))
      throw new Error(
        `source_port ${source_port_id}: unsupported package alias ${label}; CC2340 uses numeric RGE pins`,
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
        `Conflicting pin identity on source_ports ${source_port_id} and ${other.source_port_id}`,
      )
  }
  return { port, pin }
}

export function checkCc2340Function(
  resolved: ResolvedCc2340Port,
  request: Cc2340GpioRequest | "sda" | "scl",
) {
  const { port } = resolved
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
    "is_using_open_drain",
  ]
  // I2C electrical declarations remain unsupported until verified against TI.
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
      `source_port ${port.source_port_id}: ${conflict} conflicts with requested ${role} function`,
    )
}
