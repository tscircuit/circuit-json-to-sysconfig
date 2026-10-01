import {
  type CircuitJson,
  type SourcePort,
  type SourceSimpleChip,
  source_port,
  source_simple_chip,
} from "circuit-json"
import { z } from "zod"
import type { Cc2340GpioRequest, Cc2340Options } from "./cc2340/options"
import { cc2340r5rge } from "./targets/cc2340r5rge"

const firmwareSelection = z
  .object({
    source_component_id: z.string().min(1).optional(),
  })
  .strict()

/** Select an MCU when the circuit contains more than one firmware target. */
export type FirmwareSelection = z.input<typeof firmwareSelection>

function pinError(port: SourcePort, message: string): never {
  throw new Error(
    `MCU ${port.source_component_id}, pin ${port.pin_number} (${port.name}, ${port.source_port_id}): ${message}`,
  )
}

function instanceName(component: SourceSimpleChip, suffix: string): string {
  return `CONFIG_${component.name}_${suffix}`
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
}

function deriveGpio(
  port: SourcePort,
  component: SourceSimpleChip,
): Cc2340GpioRequest {
  const identity = {
    source_port_id: port.source_port_id,
    gpio_name: instanceName(component, port.name),
  }
  if (port.is_input === true && port.is_output === true)
    pinError(port, "is_input and is_output cannot both select a GPIO direction")
  if (port.is_output === true) {
    if (port.initial_output_state === undefined)
      pinError(
        port,
        "missing initial_output_state; set pinAttributes.initialOutputState to low or high",
      )
    if (port.is_using_push_pull !== true)
      pinError(
        port,
        "this target supports push-pull GPIO outputs; set pinAttributes.isUsingPushPull explicitly",
      )
    return {
      ...identity,
      direction: "output",
      initial_state: port.initial_output_state,
    }
  }
  if (port.is_input === true) {
    if (
      port.is_using_internal_pullup === undefined ||
      port.is_using_internal_pulldown === undefined
    )
      pinError(
        port,
        "missing pull selection; set pinAttributes.isUsingInternalPullup and isUsingInternalPulldown (both false means no internal pull)",
      )
    if (port.is_using_internal_pullup && port.is_using_internal_pulldown)
      pinError(port, "internal pull-up and pull-down cannot both be enabled")
    if (port.interrupt_trigger === undefined)
      pinError(
        port,
        "missing interrupt_trigger; set pinAttributes.interruptTrigger, including none to disable interrupts",
      )
    return {
      ...identity,
      direction: "input",
      pull: port.is_using_internal_pullup
        ? "up"
        : port.is_using_internal_pulldown
          ? "down"
          : "none",
      interrupt: port.interrupt_trigger,
    }
  }
  pinError(
    port,
    "missing GPIO direction; set pinAttributes.isInput or isOutput, select an activeCapability, or explicitly set doNotConfigure",
  )
}

const unsupportedFunctions = [
  "is_configured_for_spi_mosi",
  "is_configured_for_spi_miso",
  "is_configured_for_spi_sck",
  "is_configured_for_spi_cs",
  "is_configured_for_uart_tx",
  "is_configured_for_uart_rx",
] as const satisfies readonly (keyof SourcePort)[]

function hasSelectedFunction(port: SourcePort): boolean {
  return (
    port.is_input === true ||
    port.is_output === true ||
    port.is_configured_for_i2c_sda === true ||
    port.is_configured_for_i2c_scl === true ||
    unsupportedFunctions.some((field) => port[field] === true) ||
    port.initial_output_state !== undefined ||
    port.interrupt_trigger !== undefined ||
    port.i2c_max_bit_rate !== undefined
  )
}

/** Derive firmware requests only from declared intent; capability flags never select a function. */
export function deriveOptionsFromCircuitJson(
  circuitJson: CircuitJson,
  selection: FirmwareSelection = {},
): Cc2340Options {
  const { source_component_id } = firmwareSelection.parse(selection)
  const components = circuitJson.filter(
    (element) => element.type === "source_component",
  )
  const candidates = components.filter((component) =>
    source_component_id
      ? component.source_component_id === source_component_id
      : component.ftype === "simple_chip" &&
        (component.manufacturer_part_number ===
          cc2340r5rge.manufacturer_part_number ||
          component.firmware_rtos !== undefined ||
          component.firmware_lf_clock_source !== undefined),
  )
  if (candidates.length !== 1)
    throw new Error(
      `Expected exactly one MCU for firmware export; found ${candidates.length}. Select source_component_id explicitly when multiple MCUs exist.`,
    )
  const component = source_simple_chip.parse(candidates[0])
  if (
    components.filter(
      (candidate) =>
        candidate.source_component_id === component.source_component_id,
    ).length !== 1
  )
    throw new Error(
      `Duplicate source_component_id ${component.source_component_id}`,
    )
  if (
    component.manufacturer_part_number !== cc2340r5rge.manufacturer_part_number
  )
    throw new Error(
      `Automatic firmware export does not support ${component.manufacturer_part_number}; supported target: ${cc2340r5rge.manufacturer_part_number}`,
    )
  if (component.firmware_rtos !== "nortos")
    throw new Error(
      `MCU ${component.name}: firmware_rtos must explicitly be nortos (TSX firmwareRtos); other runtimes are not supported by this target`,
    )
  if (component.firmware_lf_clock_source === undefined)
    throw new Error(
      `MCU ${component.name}: missing firmware_lf_clock_source; set TSX firmwareLfClockSource to internal_rc or external_crystal`,
    )

  const ports = circuitJson
    .filter(
      (element) =>
        element.type === "source_port" &&
        element.source_component_id === component.source_component_id,
    )
    .map((port) => source_port.parse(port))
    .sort(
      (first, second) =>
        (first.pin_number ?? 0) - (second.pin_number ?? 0) ||
        first.source_port_id.localeCompare(second.source_port_id),
    )
  const options: Cc2340Options = {
    source_component_id: component.source_component_id,
    gpios: [],
    reserved_ports: [],
    firmware: {
      rtos: component.firmware_rtos,
      lf_clock_source:
        component.firmware_lf_clock_source === "internal_rc"
          ? "lf_rcosc"
          : "lf_xosc",
    },
  }
  const sdaPorts: SourcePort[] = []
  const sclPorts: SourcePort[] = []
  for (const port of ports) {
    const physicalGpio = cc2340r5rge.gpioPins.some(
      (pin) => pin.pin === port.pin_number,
    )
    if (port.do_not_configure === true) {
      if (hasSelectedFunction(port))
        pinError(
          port,
          "do_not_configure conflicts with selected firmware settings",
        )
      if (physicalGpio)
        options.reserved_ports.push({
          source_port_id: port.source_port_id,
          reason: "Explicit do_not_configure declaration",
        })
      continue
    }
    const unsupported = unsupportedFunctions.find(
      (field) => port[field] === true,
    )
    if (unsupported)
      pinError(port, `unsupported active function ${unsupported}`)
    if (port.is_configured_for_i2c_sda && port.is_configured_for_i2c_scl)
      pinError(port, "one pin cannot be both I2C SDA and SCL")
    if (port.is_configured_for_i2c_sda) {
      if (port.i2c_max_bit_rate !== undefined)
        pinError(port, "i2c_max_bit_rate belongs on the SCL pin")
      sdaPorts.push(port)
    } else if (port.is_configured_for_i2c_scl) {
      sclPorts.push(port)
    } else if (physicalGpio || port.is_gpio || hasSelectedFunction(port)) {
      options.gpios.push(deriveGpio(port, component))
    }
  }
  if (sdaPorts.length || sclPorts.length) {
    const sda = sdaPorts[0]
    const scl = sclPorts[0]
    if (sdaPorts.length !== 1 || sclPorts.length !== 1 || !sda || !scl)
      throw new Error(
        `MCU ${component.name}: expected one active I2C SDA/SCL pair; found ${sdaPorts.length} SDA and ${sclPorts.length} SCL pins`,
      )
    if (scl.i2c_max_bit_rate !== 100000)
      pinError(
        scl,
        "i2c_max_bit_rate must explicitly be 100000 bits/s for this target; set pinAttributes.i2cMaxBitRate (other rates are not supported yet)",
      )
    options.i2c = {
      i2c_name: instanceName(component, cc2340r5rge.i2c.peripheral),
      sda_source_port_id: sda.source_port_id,
      scl_source_port_id: scl.source_port_id,
      max_bit_rate: scl.i2c_max_bit_rate,
      peripheral_assignment: "fixed",
    }
  }
  return options
}
