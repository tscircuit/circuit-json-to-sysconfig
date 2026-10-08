import { expect, test } from "bun:test"
import type { SourcePort } from "circuit-json"
import {
  type Cc2340Options,
  CircuitJsonToSysConfigConverter,
  convertCircuitJsonToSysConfig,
} from "../lib"

function circuitJsonText(attributes: Record<string, unknown> = {}): string {
  return JSON.stringify([
    {
      type: "source_component",
      ftype: "simple_chip",
      name: "U1",
      source_component_id: "mcu",
      manufacturer_part_number: "CC2340R52E0RGER",
    },
    {
      type: "source_port",
      name: "DIO11",
      pin_number: 4,
      source_component_id: "mcu",
      source_port_id: "pin4",
      is_output: true,
      ...attributes,
    },
  ])
}

function conversionError(source: string, options?: Cc2340Options): string {
  const converter = new CircuitJsonToSysConfigConverter(
    JSON.parse(source),
    options,
  )
  let message: string | undefined
  try {
    converter.runUntilFinished()
  } catch (error) {
    if (!(error instanceof Error)) throw error
    message = error.message
  }
  expect(message).toBeDefined()
  expect(converter.finished).toBe(false)
  expect(() => converter.getOutput()).toThrow("must finish")
  expect(() => converter.getResolvedConfiguration()).toThrow("must finish")
  if (!message) throw new Error("Expected a conversion error")
  return message
}

test("all selected modes reject their explicit false capability", () => {
  const modes: Partial<SourcePort>[] = [
    { is_using_internal_pullup: true, can_use_internal_pullup: false },
    { is_using_internal_pulldown: true, can_use_internal_pulldown: false },
    { is_using_open_drain: true, can_use_open_drain: false },
    { is_using_push_pull: true, can_use_push_pull: false },
    { is_using_tri_state: true, can_use_tri_state: false },
    { is_using_open_collector: true, can_use_open_collector: false },
    { is_using_open_emitter: true, can_use_open_emitter: false },
    { is_configured_for_i2c_sda: true, supports_i2c_sda: false },
    { is_configured_for_i2c_scl: true, supports_i2c_scl: false },
    { is_configured_for_spi_mosi: true, supports_spi_mosi: false },
    { is_configured_for_spi_miso: true, supports_spi_miso: false },
    { is_configured_for_spi_sck: true, supports_spi_sck: false },
    { is_configured_for_spi_cs: true, supports_spi_cs: false },
    { is_configured_for_uart_tx: true, supports_uart_tx: false },
    { is_configured_for_uart_rx: true, supports_uart_rx: false },
  ]
  expect(
    modes.map((attributes) => conversionError(circuitJsonText(attributes))),
  ).toMatchInlineSnapshot(`
      [
        "U1 pin 4 (DIO11): internal pull-up is not supported",
        "U1 pin 4 (DIO11): internal pull-down is not supported",
        "U1 pin 4 (DIO11): open-drain output is not supported",
        "U1 pin 4 (DIO11): push-pull output is not supported",
        "U1 pin 4 (DIO11): tri-state output is not supported",
        "U1 pin 4 (DIO11): open-collector output is not supported",
        "U1 pin 4 (DIO11): open-emitter output is not supported",
        "U1 pin 4 (DIO11): I2C SDA is not supported",
        "U1 pin 4 (DIO11): I2C SCL is not supported",
        "U1 pin 4 (DIO11): SPI MOSI is not supported",
        "U1 pin 4 (DIO11): SPI MISO is not supported",
        "U1 pin 4 (DIO11): SPI SCK is not supported",
        "U1 pin 4 (DIO11): SPI CS is not supported",
        "U1 pin 4 (DIO11): UART TX is not supported",
        "U1 pin 4 (DIO11): UART RX is not supported",
      ]
    `)
})

test("supported or omitted capabilities preserve native GPIO configuration", () => {
  for (const capability of [true, undefined]) {
    const source = circuitJsonText({
      is_input: true,
      is_output: false,
      can_use_internal_pullup: capability,
      is_using_internal_pullup: true,
    })
    const output = convertCircuitJsonToSysConfig(JSON.parse(source)).getString()
    expect(output).toContain('GPIO1.mode = "Input"')
    expect(output).toContain('GPIO1.pull = "Pull Up"')
  }
  const source = circuitJsonText({
    can_use_internal_pullup: false,
    is_using_internal_pullup: false,
  })
  expect(convertCircuitJsonToSysConfig(JSON.parse(source)).getString()).toBe(
    convertCircuitJsonToSysConfig(JSON.parse(circuitJsonText())).getString(),
  )
})

test("request-selected settings cannot bypass false capabilities", () => {
  const options: Cc2340Options = {
    source_component_id: "mcu",
    reserved_ports: [],
    firmware: { rtos: "nortos" },
    gpios: [
      {
        source_port_id: "pin4",
        gpio_name: "CONFIG_SIGNAL",
        direction: "input",
        pull: "up",
        interrupt: "none",
      },
    ],
  }
  expect(
    conversionError(
      circuitJsonText({ is_output: false, can_use_internal_pullup: false }),
      options,
    ),
  ).toMatchInlineSnapshot(
    `"U1 pin 4 (DIO11): internal pull-up is not supported"`,
  )
  options.gpios = [
    {
      source_port_id: "pin4",
      gpio_name: "CONFIG_SIGNAL",
      direction: "output",
      initial_state: "low",
    },
  ]
  expect(
    conversionError(
      circuitJsonText({ is_output: false, can_use_push_pull: false }),
      options,
    ),
  ).toMatchInlineSnapshot(
    `"U1 pin 4 (DIO11): push-pull output is not supported"`,
  )
})

test("I2C cannot bypass the native driver's open-drain and pull-up requirements", () => {
  const circuitJson = [
    ...JSON.parse(circuitJsonText()),
    {
      type: "source_port",
      source_port_id: "sda",
      source_component_id: "mcu",
      pin_number: 3,
      name: "DIO8",
      is_configured_for_i2c_sda: true,
    },
    {
      type: "source_port",
      source_port_id: "scl",
      source_component_id: "mcu",
      pin_number: 19,
      name: "DIO6_A1",
      is_configured_for_i2c_scl: true,
    },
  ]
  circuitJson[2].can_use_open_drain = false
  expect(conversionError(JSON.stringify(circuitJson))).toMatchInlineSnapshot(
    `"U1 pin 3 (DIO8): open-drain output is not supported"`,
  )
  delete circuitJson[2].can_use_open_drain
  circuitJson[2].can_use_internal_pullup = false
  expect(conversionError(JSON.stringify(circuitJson))).toMatchInlineSnapshot(
    `"U1 pin 3 (DIO8): internal pull-up is not supported"`,
  )
})

test("wrong types and misspelled attributes identify the pin without generated IDs", () => {
  expect(
    conversionError(circuitJsonText({ is_output: "yes" })),
  ).toMatchInlineSnapshot(`"U1 pin 4 (DIO11): is_output must be boolean"`)
  expect(
    conversionError(circuitJsonText({ is_using_internal_pullupp: true })),
  ).toMatchInlineSnapshot(
    `"U1 pin 4 (DIO11): unknown field "is_using_internal_pullupp""`,
  )
  expect(
    conversionError(circuitJsonText({ isOutput: true })),
  ).toMatchInlineSnapshot(`"U1 pin 4 (DIO11): unknown field "isOutput""`)
})

test("malformed records and connections fail before target resolution", () => {
  expect(conversionError("null")).toMatchInlineSnapshot(
    `"Circuit JSON must contain an array of records"`,
  )
  expect(conversionError("[null]")).toMatchInlineSnapshot(
    `"Circuit JSON record 1 must be an object with a string type"`,
  )
  expect(conversionError("[{}]")).toMatchInlineSnapshot(
    `"Circuit JSON record 1 must be an object with a string type"`,
  )
  const malformedTrace = {
    type: "source_trace",
    source_trace_id: "trace",
    connected_source_port_ids: null,
    connected_source_net_ids: [],
  }
  expect(
    conversionError(
      JSON.stringify([...JSON.parse(circuitJsonText()), malformedTrace]),
    ),
  ).toMatchInlineSnapshot(
    `"source_trace record 3: connected_source_port_ids must be array"`,
  )
})

test("known pin metadata and unrelated render records are preserved", () => {
  const circuitJson = JSON.parse(
    circuitJsonText({
      requires_voltage: 3.3,
      required_voltage_tolerance: 0.05,
    }),
  )
  circuitJson.push({
    type: "pcb_component",
    pcb_component_id: "pcb_U1",
    source_component_id: "mcu",
    center: { x: 0, y: 0 },
    width: 1,
    height: 1,
    layer: "top",
    rotation: 0,
    custom_render_metadata: { example: true },
  })
  const before = structuredClone(circuitJson)
  expect(convertCircuitJsonToSysConfig(circuitJson).getString()).toContain(
    'GPIO1.mode = "Output"',
  )
  expect(circuitJson).toEqual(before)
})
