import { expect, test } from "bun:test"
import { any_circuit_element } from "circuit-json"
import {
  generateSysConfigSvg,
  inspectSysConfig,
  parseSysConfig,
} from "sysconfigts"
import { convertCircuitJsonToSysConfig } from "../lib"
import gpioCircuit from "./fixtures/gpio-circuit.json"

for (const ball of ["A7", "B7"]) {
  test(`pinned sysconfigts inspects and previews converted ${ball} without mutation`, () => {
    const circuitJson = any_circuit_element.array().parse(gpioCircuit)
    const port = circuitJson.find((element) => element.type === "source_port")
    if (port?.type !== "source_port") throw new Error("Missing GPIO port")
    port.port_hints = [ball]
    const config = convertCircuitJsonToSysConfig(circuitJson, {
      source_component_id: "mcu",
      source_port_id: port.source_port_id,
      gpio_name: "GPIO_PREVIEW",
      direction: "output",
    })
    const source = config.getString()
    expect(inspectSysConfig(config)).toContainEqual({
      kind: "fixed_assignment",
      target: "gpio1.MCU_GPIO.gpioPin.$assign",
      expression: `"${ball}"`,
    })
    const svg = generateSysConfigSvg(config)
    expect(svg).toContain("GPIO_PREVIEW")
    expect(svg).toContain(`&quot;${ball}&quot;`)
    expect(svg).toContain("Not a resolved pinout")
    expect(generateSysConfigSvg(config)).toBe(svg)
    expect(generateSysConfigSvg(parseSysConfig(source))).toBe(svg)
    expect(config.getString()).toBe(source)
  })
}
