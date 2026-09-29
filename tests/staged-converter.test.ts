import { expect, test } from "bun:test"
import { any_circuit_element } from "circuit-json"
import {
  CircuitJsonToSysConfigConverter,
  type ConvertCircuitJsonToSysConfigOptions,
  convertCircuitJsonToSysConfig,
} from "lib/index"
import { am2434bsdfhialvr } from "lib/targets/am2434bsdfhialvr"
import gpioCircuit from "./fixtures/gpio-circuit.json"

const options: ConvertCircuitJsonToSysConfigOptions = {
  source_component_id: "mcu",
  source_port_id: "gpio_output",
  gpio_name: "GPIO_LED",
  direction: "output",
}

for (const ball of ["A7", "B7"]) {
  test(`three steps produce the same ${ball} document as runUntilFinished and the wrapper`, () => {
    const circuitJson = any_circuit_element.array().parse(gpioCircuit)
    const port = circuitJson.find((element) => element.type === "source_port")
    if (!port) throw new Error("Missing fixture port")
    port.port_hints = [ball]
    const originalCircuit = structuredClone(circuitJson)
    const originalOptions = structuredClone(options)
    const originalTarget = structuredClone(am2434bsdfhialvr)
    const stepped = new CircuitJsonToSysConfigConverter(circuitJson, options)
    for (let stage = 0; stage < 3; stage++) {
      expect(stepped.finished).toBe(false)
      expect(() => stepped.getOutput()).toThrow("must finish")
      stepped.step()
    }
    expect(stepped.finished).toBe(true)
    const output = stepped.getOutput()
    const source = output.getString()
    expect(source).toContain(`gpio1.MCU_GPIO.gpioPin.$assign = "${ball}"`)
    stepped.step()
    stepped.runUntilFinished()
    expect(stepped.getOutput()).toBe(output)
    expect(output.getString()).toBe(source)
    expect(output.instances).toHaveLength(1)
    const completed = new CircuitJsonToSysConfigConverter(circuitJson, options)
    completed.runUntilFinished()
    expect(completed.getOutput().getString()).toBe(source)
    expect(
      convertCircuitJsonToSysConfig(circuitJson, options).getString(),
    ).toBe(source)
    expect(circuitJson).toEqual(originalCircuit)
    expect(options).toEqual(originalOptions)
    expect(am2434bsdfhialvr).toEqual(originalTarget)
  })
}

test("target failure stays at the target stage and never exposes output", () => {
  const converter = new CircuitJsonToSysConfigConverter(
    any_circuit_element.array().parse(gpioCircuit),
    { ...options, source_component_id: "missing" },
  )
  for (let attempt = 0; attempt < 4; attempt++) {
    expect(() => converter.step()).toThrow("Expected exactly one MCU")
    expect(converter.finished).toBe(false)
    expect(() => converter.getOutput()).toThrow("must finish")
  }
  expect(() => converter.runUntilFinished()).toThrow("Expected exactly one MCU")
})

test("GPIO validation occurs on the second step and failure cannot advance", () => {
  const converter = new CircuitJsonToSysConfigConverter(
    any_circuit_element.array().parse(gpioCircuit),
    { ...options, gpio_name: "invalid name" },
  )
  converter.step()
  for (let attempt = 0; attempt < 4; attempt++) {
    expect(() => converter.step()).toThrow("gpio_name")
    expect(converter.finished).toBe(false)
    expect(() => converter.getOutput()).toThrow("must finish")
  }
  expect(() => converter.runUntilFinished()).toThrow("gpio_name")
})

test("incremental conversion uses its own input snapshot", () => {
  const circuitJson = any_circuit_element.array().parse(gpioCircuit)
  const request = { ...options }
  const converter = new CircuitJsonToSysConfigConverter(circuitJson, request)
  converter.step()
  circuitJson.length = 0
  request.gpio_name = "CHANGED"
  converter.runUntilFinished()
  expect(converter.getOutput().getString()).toContain(
    'gpio1.$name = "GPIO_LED"',
  )
})
