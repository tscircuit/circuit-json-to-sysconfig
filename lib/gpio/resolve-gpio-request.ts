import { type CircuitJson, type SourcePort, source_port } from "circuit-json"
import { am2434bsdfhialvr } from "../targets/am2434bsdfhialvr"

export interface GpioRequest {
  source_component_id: string
  source_port_id: string
  gpio_name: string
  direction: "output"
}

const incompatibleAttributes = [
  "is_configured_for_i2c_sda",
  "is_configured_for_i2c_scl",
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
  "is_using_internal_pullup",
  "is_using_internal_pulldown",
  "is_using_open_drain",
  "is_using_push_pull",
] as const satisfies readonly (keyof SourcePort)[]

function getPortLabels(port: SourcePort) {
  return [...new Set([port.name, ...(port.port_hints ?? [])])]
}

function getBallLabels(port: SourcePort) {
  return getPortLabels(port).filter((label) =>
    /^[A-Z]{1,2}[1-9][0-9]*$/.test(label),
  )
}

export function resolveGpioRequest(
  circuitJson: CircuitJson,
  request: GpioRequest,
) {
  if (request.direction !== "output")
    throw new Error("Only GPIO direction output is supported")
  if (!/^[A-Z][A-Z0-9_]*$/.test(request.gpio_name)) {
    throw new Error(
      "gpio_name must be an uppercase C identifier starting with A-Z",
    )
  }
  const ports = circuitJson.filter((element) => element.type === "source_port")
  const matches = ports.filter(
    (port) => port.source_port_id === request.source_port_id,
  )
  const selectedPort = matches[0]
  if (matches.length !== 1 || !selectedPort) {
    throw new Error(
      `Expected exactly one source_port ${request.source_port_id}; found ${matches.length}`,
    )
  }
  const port = source_port.parse(selectedPort)
  if (port.source_component_id !== request.source_component_id) {
    throw new Error(
      `source_port ${port.source_port_id} does not belong to MCU ${request.source_component_id}`,
    )
  }
  const conflictingAttribute = incompatibleAttributes.find(
    (attribute) => port[attribute] === true,
  )
  if (conflictingAttribute) {
    throw new Error(
      `source_port ${port.source_port_id}: ${conflictingAttribute} conflicts with this GPIO-only output scope`,
    )
  }
  const ballLabels = getBallLabels(port)
  if (ballLabels.length !== 1) {
    throw new Error(
      `source_port ${port.source_port_id}: expected one unambiguous package-ball label in name/port_hints; found ${ballLabels.join(", ") || "none"}`,
    )
  }
  const gpioPin = am2434bsdfhialvr.gpioPins.find(
    (gpioPin) => gpioPin.ball === ballLabels[0],
  )
  if (!gpioPin) {
    throw new Error(
      `Unsupported GPIO ball ${ballLabels[0]}; supported ALV balls are A7 and B7`,
    )
  }
  const labels = getPortLabels(port)
  for (const otherPin of am2434bsdfhialvr.gpioPins) {
    if (
      otherPin.ball !== gpioPin.ball &&
      (labels.includes(otherPin.devicePin) ||
        labels.includes(`${otherPin.peripheral}_${otherPin.pin}`))
    ) {
      throw new Error(
        `source_port ${port.source_port_id}: signal alias conflicts with ball ${gpioPin.ball}`,
      )
    }
  }
  for (const otherPort of ports) {
    if (
      otherPort.source_component_id !== port.source_component_id ||
      otherPort.source_port_id === port.source_port_id
    )
      continue
    if (
      getPortLabels(otherPort).some((label) =>
        [
          gpioPin.ball,
          gpioPin.devicePin,
          `${gpioPin.peripheral}_${gpioPin.pin}`,
        ].includes(label),
      ) ||
      (port.pin_number !== undefined &&
        otherPort.pin_number === port.pin_number)
    ) {
      throw new Error(
        `Conflicting pin identity on source_ports ${port.source_port_id} and ${otherPort.source_port_id}`,
      )
    }
  }
  return { gpioPin, gpio_name: request.gpio_name, direction: request.direction }
}
