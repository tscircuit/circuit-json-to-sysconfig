import { expect, test } from "bun:test"
import {
  type CircuitJson,
  type SourcePort,
  source_port,
  source_simple_chip,
} from "circuit-json"
import {
  CircuitJsonToSysConfigConverter,
  convertCircuitJsonToSysConfig,
  deriveOptionsFromCircuitJson,
} from "../lib"

function fixture(outputPin = 4): CircuitJson {
  return [
    source_simple_chip.parse({
      type: "source_component",
      ftype: "simple_chip",
      source_component_id: "mcu",
      name: "U2",
      manufacturer_part_number: "CC2340R52E0RGER",
      firmware_rtos: "nortos",
      firmware_lf_clock_source: "internal_rc",
    }),
    source_port.parse({
      type: "source_port",
      source_component_id: "mcu",
      source_port_id: "led",
      name: "LED",
      pin_number: outputPin,
      is_output: true,
      is_input: false,
      is_using_push_pull: true,
      initial_output_state: "high",
    }),
    source_port.parse({
      type: "source_port",
      source_component_id: "mcu",
      source_port_id: "button",
      name: "BUTTON",
      pin_number: 5,
      is_input: true,
      is_using_internal_pullup: false,
      is_using_internal_pulldown: false,
      interrupt_trigger: "none",
    }),
    source_port.parse({
      type: "source_port",
      source_component_id: "mcu",
      source_port_id: "sda",
      name: "SDA",
      pin_number: 3,
      is_configured_for_i2c_sda: true,
      is_using_open_drain: true,
    }),
    source_port.parse({
      type: "source_port",
      source_component_id: "mcu",
      source_port_id: "scl",
      name: "SCL",
      pin_number: 19,
      is_configured_for_i2c_scl: true,
      is_using_open_drain: true,
      i2c_max_bit_rate: 100000,
    }),
    source_port.parse({
      type: "source_port",
      source_component_id: "mcu",
      source_port_id: "debug",
      name: "SWDIO",
      pin_number: 7,
      is_gpio: true,
      do_not_configure: true,
    }),
  ]
}

function editPort(circuit: CircuitJson, source_port_id: string): SourcePort {
  const port = circuit.find(
    (element) =>
      element.type === "source_port" &&
      element.source_port_id === source_port_id,
  )
  if (port?.type !== "source_port") throw new Error("Missing fixture port")
  return port
}

test("derives output, input, I2C and excluded pins without a request file", () => {
  const circuit = fixture()
  const converter = new CircuitJsonToSysConfigConverter(circuit)
  expect(() => converter.getResolvedOptions()).toThrow("must finish")
  converter.runUntilFinished()
  const options = converter.getResolvedOptions()
  expect(options).toEqual({
    source_component_id: "mcu",
    gpios: [
      {
        source_port_id: "led",
        gpio_name: "CONFIG_U2_LED",
        direction: "output",
        initial_state: "high",
      },
      {
        source_port_id: "button",
        gpio_name: "CONFIG_U2_BUTTON",
        direction: "input",
        pull: "none",
        interrupt: "none",
      },
    ],
    i2c: {
      i2c_name: "CONFIG_U2_I2C0",
      sda_source_port_id: "sda",
      scl_source_port_id: "scl",
      max_bit_rate: 100000,
      peripheral_assignment: "fixed",
    },
    reserved_ports: [
      {
        source_port_id: "debug",
        reason: "Explicit do_not_configure declaration",
      },
    ],
    firmware: { rtos: "nortos", lf_clock_source: "lf_rcosc" },
  })
  const text = converter.getOutput().getString()
  expect(text).toContain('GPIO1.gpioPin.$assign = "DIO11"')
  expect(text).toContain('GPIO1.initialOutputState = "High"')
  expect(text).toContain('GPIO2.interruptTrigger = "None"')
  expect(text).toContain('I2C1.i2c.$assign = "I2C0"')
  expect(text).not.toContain('gpioPin.$assign = "DIO16_SWDIO"')
  expect(text).toBe(
    convertCircuitJsonToSysConfig(circuit.toReversed()).getString(),
  )
  options.source_component_id = "mutated"
  expect(converter.getResolvedOptions().source_component_id).toBe("mcu")
})

test("changing board pin, level and interrupt choices changes the generated configuration", () => {
  const circuit = fixture(6)
  editPort(circuit, "led").initial_output_state = "low"
  editPort(circuit, "button").interrupt_trigger = "rising"
  editPort(circuit, "button").is_using_internal_pullup = true
  const text = convertCircuitJsonToSysConfig(circuit).getString()
  expect(text).toContain('GPIO2.gpioPin.$assign = "DIO13"')
  expect(text).toContain('GPIO2.initialOutputState = "Low"')
  expect(text).toContain('GPIO1.interruptTrigger = "Rising Edge"')
  expect(text).toContain('GPIO1.pull = "Pull Up"')
})

test("missing choices identify the exact pin and TSX attribute instead of inventing defaults", () => {
  const cases: { id: string; field: keyof SourcePort; message: string }[] = [
    {
      id: "led",
      field: "initial_output_state",
      message: "pinAttributes.initialOutputState",
    },
    {
      id: "led",
      field: "is_using_push_pull",
      message: "pinAttributes.isUsingPushPull",
    },
    {
      id: "button",
      field: "is_using_internal_pullup",
      message: "pinAttributes.isUsingInternalPullup",
    },
    {
      id: "button",
      field: "is_using_internal_pulldown",
      message: "isUsingInternalPulldown",
    },
    {
      id: "button",
      field: "interrupt_trigger",
      message: "pinAttributes.interruptTrigger",
    },
    {
      id: "scl",
      field: "i2c_max_bit_rate",
      message: "pinAttributes.i2cMaxBitRate",
    },
  ]
  for (const { id, field, message } of cases) {
    const circuit = fixture()
    delete editPort(circuit, id)[field]
    expect(() => convertCircuitJsonToSysConfig(circuit)).toThrow(message)
    expect(() => convertCircuitJsonToSysConfig(circuit)).toThrow(
      `(${editPort(circuit, id).name}, ${id})`,
    )
  }
})

test("capabilities, isGpio and bidirectionality do not select firmware behavior", () => {
  const circuit = fixture()
  const port = editPort(circuit, "led")
  delete port.is_output
  delete port.initial_output_state
  delete port.is_using_push_pull
  port.is_gpio = true
  port.is_bidirectional = true
  port.supports_i2c_sda = true
  expect(() => convertCircuitJsonToSysConfig(circuit)).toThrow(
    "missing GPIO direction",
  )
  port.do_not_configure = true
  expect(deriveOptionsFromCircuitJson(circuit).reserved_ports).toHaveLength(2)
})

test("rejects unsupported, inconsistent and partially selected functions", () => {
  const cases: {
    id: string
    attributes: Partial<SourcePort>
    message: string
  }[] = [
    { id: "led", attributes: { is_input: true }, message: "cannot both" },
    {
      id: "led",
      attributes: { do_not_configure: true },
      message: "do_not_configure conflicts",
    },
    {
      id: "led",
      attributes: { is_using_tri_state: true },
      message: "is_using_tri_state conflicts",
    },
    {
      id: "button",
      attributes: {
        is_using_internal_pullup: true,
        is_using_internal_pulldown: true,
      },
      message: "cannot both",
    },
    {
      id: "button",
      attributes: { is_configured_for_spi_mosi: true },
      message: "unsupported active function",
    },
    {
      id: "scl",
      attributes: { i2c_max_bit_rate: 400000 },
      message: "other rates are not supported",
    },
    {
      id: "sda",
      attributes: { i2c_max_bit_rate: 100000 },
      message: "belongs on the SCL",
    },
    {
      id: "sda",
      attributes: { is_configured_for_i2c_scl: true },
      message: "both I2C SDA and SCL",
    },
    {
      id: "button",
      attributes: { name: "LED" },
      message: "Duplicate instance name",
    },
  ]
  for (const { id, attributes, message } of cases) {
    const circuit = fixture()
    Object.assign(editPort(circuit, id), attributes)
    expect(() => convertCircuitJsonToSysConfig(circuit)).toThrow(message)
  }
  expect(() =>
    convertCircuitJsonToSysConfig(
      fixture().filter(
        (element) =>
          element.type !== "source_port" || element.source_port_id !== "scl",
      ),
    ),
  ).toThrow("one active I2C SDA/SCL pair")
})

test("selects MCUs explicitly and validates runtime, clock and component identities", () => {
  const circuit = fixture()
  const chip = circuit.find((element) => element.type === "source_component")
  if (chip?.ftype !== "simple_chip") throw new Error("Missing fixture chip")
  circuit.push({ ...chip, source_component_id: "second", name: "U3" })
  expect(() => convertCircuitJsonToSysConfig(circuit)).toThrow("found 2")
  expect(
    convertCircuitJsonToSysConfig(circuit, {
      source_component_id: "mcu",
    }).getString(),
  ).toContain("CONFIG_U2_LED")
  chip.firmware_rtos = "freertos"
  expect(() =>
    convertCircuitJsonToSysConfig(circuit, { source_component_id: "mcu" }),
  ).toThrow("other runtimes are not supported")
  chip.firmware_rtos = "nortos"
  delete chip.firmware_lf_clock_source
  expect(() =>
    convertCircuitJsonToSysConfig(circuit, { source_component_id: "mcu" }),
  ).toThrow("firmwareLfClockSource")
  circuit.push({ ...chip })
  expect(() =>
    convertCircuitJsonToSysConfig(circuit, { source_component_id: "mcu" }),
  ).toThrow("found 2")
})

test("legacy options cannot contradict explicitly declared firmware choices", () => {
  const circuit = fixture()
  const options = deriveOptionsFromCircuitJson(circuit)
  editPort(circuit, "led").initial_output_state = "low"
  expect(() => convertCircuitJsonToSysConfig(circuit, options)).toThrow(
    "initial_output_state conflicts",
  )
  editPort(circuit, "led").initial_output_state = "high"
  editPort(circuit, "button").interrupt_trigger = "both"
  expect(() => convertCircuitJsonToSysConfig(circuit, options)).toThrow(
    "interrupt_trigger conflicts",
  )
})
