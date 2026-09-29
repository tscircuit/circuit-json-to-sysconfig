import { any_circuit_element } from "circuit-json"
import { convertCircuitJsonToSysConfig } from "../lib"
import gpioCircuit from "../tests/fixtures/gpio-circuit.json"

export function createGpioValidationCases() {
  // Independent expected results from TI's ALV pin table, not the converter's lookup.
  return [
    { ball: "A7", pin: 5, devicePin: "MCU_SPI1_CS0" },
    { ball: "B7", pin: 6, devicePin: "MCU_SPI1_CS1" },
  ].map((expectedPin) => {
    const circuitJson = any_circuit_element.array().parse(gpioCircuit)
    const port = circuitJson.find((element) => element.type === "source_port")
    if (port?.type !== "source_port")
      throw new Error("Missing GPIO validation source port")
    port.port_hints = [expectedPin.ball]
    const options = {
      source_component_id: "mcu",
      source_port_id: port.source_port_id,
      gpio_name: "GPIO_CONVERTED",
      direction: "output",
    } as const
    return {
      variant: `converted-${expectedPin.ball}`,
      source: convertCircuitJsonToSysConfig(circuitJson, options).getString(),
      expected: {
        ...expectedPin,
        peripheral: "MCU_GPIO0",
        gpio_name: options.gpio_name,
      },
    }
  })
}
