import { expect, test } from "bun:test"
import {
  any_circuit_element,
  type CircuitJson,
  type SourcePort,
  source_port,
} from "circuit-json"
import { inspectSysConfig, parseSysConfig } from "sysconfigts"
import { loadPedometerCircuit } from "../examples/pedometer/load-circuit"
import {
  CircuitJsonToSysConfigConverter,
  convertCircuitJsonToSysConfig,
} from "../lib"
import derivedFixture from "./fixtures/derived-cc2340/circuit.json"

const pedometer = await loadPedometerCircuit()

function circuit(ports: Partial<SourcePort>[]): CircuitJson {
  return [
    {
      type: "source_component",
      ftype: "simple_chip",
      source_component_id: "mcu",
      name: "U1",
      manufacturer_part_number: "CC2340R52E0RGER",
    },
    ...ports.map((port, index) =>
      source_port.parse({
        type: "source_port",
        source_component_id: "mcu",
        source_port_id: `port_${index}`,
        name: `signal_${index}`,
        ...port,
      }),
    ),
  ]
}

function connected(ports: Partial<SourcePort>[]): CircuitJson {
  return [
    ...circuit(ports),
    {
      type: "source_trace",
      source_trace_id: "trace",
      connected_source_port_ids: ports.map((_, index) => `port_${index}`),
      connected_source_net_ids: [],
    },
  ]
}

test("existing input/output flags produce native GPIOs without a request", () => {
  const input = circuit([
    { pin_number: 5, is_gpio: true, is_output: true },
    { pin_number: 6, is_input: true, is_using_internal_pullup: true },
  ])
  const before = structuredClone(input)
  const config = convertCircuitJsonToSysConfig(input)
  const source = config.getString()
  expect(source).toContain('GPIO1.mode = "Output"')
  expect(source).toContain('GPIO1.gpioPin.$assign = "DIO12"')
  expect(source).toContain('GPIO2.mode = "Input"')
  expect(source).toContain('GPIO2.pull = "Pull Up"')
  expect(source).not.toContain("initialOutputState")
  expect(source).not.toContain("interruptTrigger")
  expect(source).not.toContain("--rtos")
  expect(source).not.toContain("srcClkLF")
  expect(parseSysConfig(source).getString()).toBe(source)
  expect(inspectSysConfig(parseSysConfig(source))).toEqual(
    inspectSysConfig(config),
  )
  expect(input).toEqual(before)
})

test("selected I2C pins use physical mapping and leave bitrate to TI", () => {
  const source = convertCircuitJsonToSysConfig(
    circuit([
      {
        pin_number: 3,
        is_configured_for_i2c_sda: true,
        is_bidirectional: true,
        is_using_open_drain: true,
      },
      {
        pin_number: 19,
        is_configured_for_i2c_scl: true,
        is_using_open_drain: true,
      },
    ]),
  ).getString()
  expect(source).toContain('I2C1.i2c.sdaPin.$assign = "DIO8"')
  expect(source).toContain('I2C1.i2c.sclPin.$assign = "DIO6_A1_AR+"')
  expect(source).toContain('I2C1.i2c.$assign = "I2C0"')
  expect(source).not.toContain("maxBitRate")
  expect(parseSysConfig(source).getString()).toBe(source)
})

test("connected GPIO capability alone reports every unresolved pin", () => {
  expect(() =>
    convertCircuitJsonToSysConfig(
      connected([
        { pin_number: 5, is_gpio: true },
        { pin_number: 6, is_gpio: true },
      ]),
    ),
  ).toThrow(/port_0.*pin 5[\s\S]*port_1.*pin 6/)
})

test("unused capabilities do not activate GPIO or I2C", () => {
  const source = convertCircuitJsonToSysConfig(
    circuit([
      { pin_number: 5, is_output: true },
      {
        pin_number: 6,
        is_gpio: true,
        supports_i2c_sda: true,
        can_use_open_drain: true,
      },
    ]),
  ).getString()
  expect(source.match(/GPIO.addInstance/g)).toHaveLength(1)
  expect(source).not.toContain("DIO13")
  expect(source).not.toContain("/ti/drivers/I2C")
})

for (const flags of [
  { is_input: true, is_output: true },
  { is_bidirectional: true },
  { is_output: true, is_bidirectional: true },
  { is_output: true, is_using_open_drain: true },
  { is_output: true, is_using_tri_state: true },
  { is_output: true, is_using_open_collector: true },
  { is_output: true, is_using_open_emitter: true },
  { is_output: true, is_passive: true },
  {
    is_input: true,
    is_using_internal_pullup: true,
    is_using_internal_pulldown: true,
  },
  { is_output: true, requires_power: true },
  { is_output: true, do_not_connect: true },
  { is_configured_for_spi_sck: true },
  { is_configured_for_uart_tx: true },
] satisfies Partial<SourcePort>[]) {
  test(`rejects unsupported or contradictory declarations ${JSON.stringify(flags)}`, () => {
    expect(() =>
      convertCircuitJsonToSysConfig(circuit([{ pin_number: 5, ...flags }])),
    ).toThrow(/port_0/)
  })
}

test("unpaired, duplicate, conflicting and unsupported I2C routes fail", () => {
  for (const ports of [
    [{ pin_number: 3, is_configured_for_i2c_sda: true }],
    [
      {
        pin_number: 3,
        is_configured_for_i2c_sda: true,
        is_configured_for_i2c_scl: true,
      },
    ],
    [
      { pin_number: 3, is_configured_for_i2c_sda: true },
      { pin_number: 5, is_configured_for_i2c_sda: true },
      { pin_number: 19, is_configured_for_i2c_scl: true },
    ],
    [
      { pin_number: 5, is_configured_for_i2c_sda: true },
      { pin_number: 19, is_configured_for_i2c_scl: true },
    ],
    [
      { pin_number: 3, is_configured_for_i2c_sda: true, is_output: true },
      { pin_number: 19, is_configured_for_i2c_scl: true },
    ],
  ])
    expect(() => convertCircuitJsonToSysConfig(circuit(ports))).toThrow()
})

test("SDK debug ownership and LF crystal conflicts are explicit", () => {
  const debug = convertCircuitJsonToSysConfig(
    connected([
      { pin_number: 5, is_output: true },
      { pin_number: 7, is_gpio: true },
      { pin_number: 8, is_gpio: true },
    ]),
  ).getString()
  expect(debug.match(/GPIO.addInstance/g)).toHaveLength(1)
  expect(
    convertCircuitJsonToSysConfig(
      circuit([{ pin_number: 7, is_output: true }]),
    ).getString(),
  ).toContain('GPIO1.gpioPin.$assign = "DIO16_SWDIO"')
  expect(() =>
    convertCircuitJsonToSysConfig(
      circuit([{ pin_number: 14, is_output: true }]),
    ),
  ).toThrow(/LF crystal/)
  expect(() =>
    convertCircuitJsonToSysConfig(connected([{ pin_number: 15 }])),
  ).toThrow(/LF crystal/)
})

test("ambiguous MCU selection requires only the existing component selector", () => {
  const input = circuit([{ pin_number: 5, is_output: true }])
  input.push({
    type: "source_component",
    ftype: "simple_chip",
    source_component_id: "other",
    name: "U2",
    manufacturer_part_number: "CC2340R52E0RGER",
  })
  expect(() => convertCircuitJsonToSysConfig(input)).toThrow(
    /source_component_id/,
  )
  expect(
    convertCircuitJsonToSysConfig(input, { source_component_id: "mcu" })
      .instances,
  ).toHaveLength(1)
  expect(() =>
    convertCircuitJsonToSysConfig(input, { source_component_id: "missing" }),
  ).toThrow(/Expected exactly one MCU/)
})

test("duplicate identities and contradictory aliases remain errors", () => {
  for (const ports of [
    [{ pin_number: 5, is_output: true }, { pin_number: 5 }],
    [
      { pin_number: 5, is_output: true },
      { pin_number: 6, port_hints: ["DIO12"] },
    ],
    [{ pin_number: 5, port_hints: ["DIO13"], is_output: true }],
    [
      { pin_number: 5, source_port_id: "duplicate", is_output: true },
      { pin_number: 6, source_port_id: "duplicate", is_input: true },
    ],
  ])
    expect(() => convertCircuitJsonToSysConfig(circuit(ports))).toThrow()
})

test("three stages snapshot inputs, stay deterministic and expose no partial output", () => {
  const input = circuit([
    { pin_number: 6, is_input: true },
    { pin_number: 5, is_output: true },
  ])
  const expected = convertCircuitJsonToSysConfig(input).getString()
  expect(convertCircuitJsonToSysConfig([...input].reverse()).getString()).toBe(
    expected,
  )
  const converter = new CircuitJsonToSysConfigConverter(input)
  input.length = 0
  for (let stage = 0; stage < 3; stage++) {
    expect(() => converter.getOutput()).toThrow("must finish")
    converter.step()
  }
  expect(converter.getOutput().getString()).toBe(expected)
  const failed = new CircuitJsonToSysConfigConverter(
    connected([{ pin_number: 5 }]),
  )
  failed.step()
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(() => failed.step()).toThrow(/port_0/)
    expect(failed.finished).toBe(false)
    expect(() => failed.getOutput()).toThrow("must finish")
  }
})

test("the unmodified pedometer cannot acquire firmware choices from its name", () => {
  expect(() => convertCircuitJsonToSysConfig(pedometer)).toThrow(
    /Unresolved CC2340 pin configuration/,
  )
})

test("the TI fixture preserves the released role flags through schema parsing", () => {
  const input = any_circuit_element.array().parse(derivedFixture)
  const source = convertCircuitJsonToSysConfig(input).getString()
  expect(source).toContain('GPIO1.mode = "Output"')
  expect(source).toContain('GPIO2.mode = "Input"')
  expect(source).toContain('GPIO2.pull = "Pull Up"')
  expect(source).toContain('I2C1.i2c.$assign = "I2C0"')
})

test("explicit false pull attributes disable pulls without activating capabilities", () => {
  const source = convertCircuitJsonToSysConfig(
    circuit([
      {
        pin_number: 5,
        is_input: true,
        is_using_internal_pullup: false,
        can_use_internal_pulldown: true,
      },
      { pin_number: 6, is_input: true, is_using_internal_pulldown: false },
    ]),
  ).getString()
  expect(source).toContain('GPIO1.pull = "None"')
  expect(source).toContain('GPIO2.pull = "None"')
})

test("missing and invalid GPIO physical identities cannot silently disappear", () => {
  for (const pin_number of [undefined, 0, 26, 5.5])
    expect(() =>
      convertCircuitJsonToSysConfig(
        circuit([
          { pin_number: 5, is_output: true },
          { pin_number, is_input: true },
        ]),
      ),
    ).toThrow(/numeric RGE physical pin/)
})
