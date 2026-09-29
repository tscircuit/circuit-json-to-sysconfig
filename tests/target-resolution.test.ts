import { expect, test } from "bun:test"
import { any_circuit_element } from "circuit-json"
import { convertCircuitJsonToSysConfig } from "lib/index"
import { resolveTiTarget } from "lib/targets/am2434bsdfhialvr"
import gpioCircuit from "./fixtures/gpio-circuit.json"

test("exact orderable MPN resolves to the verified ALV profile", () => {
  const target = resolveTiTarget("AM2434BSDFHIALVR")
  expect(target.device).toBe("AM243x_ALV_beta")
  expect(target.package).toBe("ALV")
  expect(target.context).toBe("r5fss0-0")
  expect(target.product).toBe("MCU_PLUS_SDK@07.03.01")
  expect(target.gpioPins).toEqual([
    { ball: "A7", peripheral: "MCU_GPIO0", pin: 5, devicePin: "MCU_SPI1_CS0" },
    { ball: "B7", peripheral: "MCU_GPIO0", pin: 6, devicePin: "MCU_SPI1_CS1" },
  ])
})

for (const manufacturer_part_number of [
  undefined,
  "",
  "AM2434",
  "AM2434BSDFHIALXR",
  "AM2434BSDFHIALVR.B",
  "am2434bsdfhialvr",
  "unverified",
]) {
  test(`rejects missing/unknown/incompatible MPN ${manufacturer_part_number}`, () => {
    const circuitJson = any_circuit_element.array().parse(gpioCircuit)
    const chip = circuitJson.find(
      (element) => element.type === "source_component",
    )
    if (chip?.type !== "source_component") throw new Error("Missing chip")
    chip.manufacturer_part_number = manufacturer_part_number
    expect(() =>
      convertCircuitJsonToSysConfig(circuitJson, {
        source_component_id: "mcu",
        source_port_id: "gpio_output",
        gpio_name: "GPIO_LED",
        direction: "output",
      }),
    ).toThrow("only AM2434BSDFHIALVR (ALV package)")
  })
}

test("requires exactly one selected MCU component", () => {
  const circuitJson = any_circuit_element.array().parse(gpioCircuit)
  const options = {
    source_component_id: "missing",
    source_port_id: "gpio_output",
    gpio_name: "GPIO_LED",
    direction: "output",
  } as const
  expect(() => convertCircuitJsonToSysConfig(circuitJson, options)).toThrow(
    "found 0",
  )
  const chip = circuitJson.find(
    (element) => element.type === "source_component",
  )
  if (!chip) throw new Error("Missing chip")
  circuitJson.push(chip)
  expect(() =>
    convertCircuitJsonToSysConfig(circuitJson, {
      ...options,
      source_component_id: "mcu",
    }),
  ).toThrow("found 2")
})
