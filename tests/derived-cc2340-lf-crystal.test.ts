import { expect, test } from "bun:test"
import {
  any_circuit_element,
  type CircuitJson,
  type SourcePort,
} from "circuit-json"
import { parseSysConfig } from "sysconfigts"
import {
  CircuitJsonToSysConfigConverter,
  convertCircuitJsonToSysConfig,
} from "../lib"
import fixture from "./fixtures/derived-cc2340/lf-crystal.circuit.json"

function crystalCircuit(): CircuitJson {
  return any_circuit_element.array().parse(fixture)
}

test("validation configuration preserves omissions and cannot mutate the converter", () => {
  const converter = new CircuitJsonToSysConfigConverter(crystalCircuit())
  expect(() => converter.getResolvedConfiguration()).toThrow(/must finish/)
  converter.runUntilFinished()
  const configuration = converter.getResolvedConfiguration()
  expect(configuration.component.name).toBe("U1")
  expect(configuration.cc2340?.lfCrystal?.frequency).toBe(32768)
  expect(configuration.cc2340?.options).toBeUndefined()
  expect(configuration.cc2340?.gpios[0]?.request).toEqual({
    source_port_id: "output",
    gpio_name: "CONFIG_U1_PIN4",
    direction: "output",
  })
  configuration.component.name = "modified"
  configuration.cc2340?.gpios.splice(0)
  expect(converter.getResolvedConfiguration().component.name).toBe("U1")
  expect(converter.getResolvedConfiguration().cc2340?.gpios).toHaveLength(1)
})

function crystalComponent(circuitJson: CircuitJson) {
  const crystal = circuitJson.find(
    (element) =>
      element.type === "source_component" && element.ftype === "simple_crystal",
  )
  if (
    crystal?.type !== "source_component" ||
    crystal.ftype !== "simple_crystal"
  )
    throw new Error("Missing fixture crystal")
  return crystal
}

function mcuPort(circuitJson: CircuitJson, pin_number: number): SourcePort {
  const port = circuitJson.find(
    (element) =>
      element.type === "source_port" &&
      element.source_component_id === "mcu" &&
      element.pin_number === pin_number,
  )
  if (port?.type !== "source_port") throw new Error("Missing fixture MCU port")
  return port
}

test("a connected 32.768 kHz crystal selects LF XOSC without a firmware request", () => {
  const circuitJson = crystalCircuit()
  const before = structuredClone(circuitJson)
  const config = convertCircuitJsonToSysConfig(circuitJson)
  const source = config.getString()
  expect(source).toContain('scripting.addModule("/ti/drivers/Power")')
  expect(source).toContain('CCFG.srcClkLF = "LF XOSC"')
  expect(source.match(/GPIO.addInstance/g)).toHaveLength(1)
  expect(source).not.toMatch(/gpioPin\.\$assign = "DIO[34]_X32/)
  expect(parseSysConfig(source).getString()).toBe(source)
  expect(
    convertCircuitJsonToSysConfig([...circuitJson].reverse()).getString(),
  ).toBe(source)
  expect(circuitJson).toEqual(before)
})

test("direct traces and swapped interchangeable crystal terminals resolve the same clock", () => {
  const circuitJson: CircuitJson = crystalCircuit().filter(
    (element) => element.type !== "source_trace",
  )
  circuitJson.push(
    {
      type: "source_trace",
      source_trace_id: "direct_p",
      connected_source_port_ids: ["lf_p", "crystal_n"],
      connected_source_net_ids: [],
    },
    {
      type: "source_trace",
      source_trace_id: "direct_n",
      connected_source_port_ids: ["lf_n", "crystal_p"],
      connected_source_net_ids: [],
    },
  )
  expect(convertCircuitJsonToSysConfig(circuitJson).getString()).toContain(
    'CCFG.srcClkLF = "LF XOSC"',
  )
})

test("bidirectional GPIO capabilities do not claim the LF crystal pins", () => {
  const circuitJson = crystalCircuit()
  for (const pin_number of [4, 14, 15])
    mcuPort(circuitJson, pin_number).is_bidirectional = false
  const baseline = convertCircuitJsonToSysConfig(circuitJson).getString()
  for (const pin_number of [4, 14, 15]) {
    const port = mcuPort(circuitJson, pin_number)
    port.is_gpio = true
    port.is_bidirectional = true
  }
  expect(convertCircuitJsonToSysConfig(circuitJson).getString()).toBe(baseline)
})

test("missing crystal terminals and incomplete wiring remain unresolved", () => {
  for (const source_trace_id of [
    "crystal_p_trace",
    "crystal_n_trace",
    "mcu_p_trace",
    "mcu_n_trace",
  ]) {
    const input = crystalCircuit().filter(
      (element) =>
        element.type !== "source_trace" ||
        element.source_trace_id !== source_trace_id,
    )
    expect(() => convertCircuitJsonToSysConfig(input)).toThrow(
      /LF crystal ownership is unresolved/,
    )
  }
})

test("a component name cannot substitute for crystal type or frequency", () => {
  const circuitJson = crystalCircuit()
  const crystal = crystalComponent(circuitJson)
  crystal.name = "32.768kHz_LF_crystal"
  crystal.frequency = 48000000
  expect(() => convertCircuitJsonToSysConfig(circuitJson)).toThrow(
    /32768 Hz.*48000000 Hz/,
  )
})

test("four-pin crystals require their own terminal mapping", () => {
  const circuitJson = crystalCircuit()
  crystalComponent(circuitJson).pin_variant = "four_pin"
  expect(() => convertCircuitJsonToSysConfig(circuitJson)).toThrow(
    /exactly two distinct terminals/,
  )
})

test("shorted LF nets cannot select an external crystal", () => {
  const circuitJson = crystalCircuit()
  circuitJson.push({
    type: "source_trace",
    source_trace_id: "short",
    connected_source_port_ids: ["lf_p", "lf_n"],
    connected_source_net_ids: [],
  })
  expect(() => convertCircuitJsonToSysConfig(circuitJson)).toThrow(
    /same electrical net/,
  )
})

test("another MCU pin on a crystal net is an ownership conflict", () => {
  const circuitJson = crystalCircuit()
  circuitJson.push({
    type: "source_trace",
    source_trace_id: "conflict",
    connected_source_port_ids: ["lf_p", "output"],
    connected_source_net_ids: [],
  })
  expect(() => convertCircuitJsonToSysConfig(circuitJson)).toThrow(
    /another MCU pin/,
  )
})

test("multiple connected crystals are ambiguous", () => {
  const circuitJson = crystalCircuit()
  circuitJson.push(
    {
      ...crystalComponent(circuitJson),
      source_component_id: "second_crystal",
      name: "Y2",
    },
    {
      type: "source_port",
      source_port_id: "second_p",
      source_component_id: "second_crystal",
      name: "pin1",
      pin_number: 1,
    },
    {
      type: "source_port",
      source_port_id: "second_n",
      source_component_id: "second_crystal",
      name: "pin2",
      pin_number: 2,
    },
    {
      type: "source_trace",
      source_trace_id: "second_p_trace",
      connected_source_port_ids: ["second_p"],
      connected_source_net_ids: ["net_p"],
    },
    {
      type: "source_trace",
      source_trace_id: "second_n_trace",
      connected_source_port_ids: ["second_n"],
      connected_source_net_ids: ["net_n"],
    },
  )
  expect(() => convertCircuitJsonToSysConfig(circuitJson)).toThrow(
    /multiple crystals/,
  )
})

for (const declarations of [
  { is_output: true },
  { is_input: true },
  { is_configured_for_i2c_sda: true },
  { is_using_internal_pullup: true },
  { is_using_open_drain: true },
  { do_not_connect: true },
  { requires_power: true },
] satisfies Partial<SourcePort>[]) {
  test(`LF crystal ownership rejects ${JSON.stringify(declarations)}`, () => {
    const circuitJson = crystalCircuit()
    Object.assign(mcuPort(circuitJson, 14), declarations)
    expect(() => convertCircuitJsonToSysConfig(circuitJson)).toThrow(
      /LF crystal.*conflicting/,
    )
  })
}
