import { describe, expect, test } from "bun:test"
import {
  any_circuit_element,
  type CircuitJson,
  type SourcePort,
} from "circuit-json"
import {
  type ConvertCircuitJsonToSysConfigOptions,
  convertCircuitJsonToSysConfig,
} from "lib/index"
import { parseSysConfig, SysConfig, SysConfigLiteral } from "sysconfigts"
import gpioCircuit from "./fixtures/gpio-circuit.json"

const options: ConvertCircuitJsonToSysConfigOptions = {
  source_component_id: "mcu",
  source_port_id: "gpio_output",
  gpio_name: "GPIO_LED",
  direction: "output",
}

function createCircuit() {
  return any_circuit_element.array().parse(gpioCircuit)
}

function getPort(circuitJson: CircuitJson) {
  const port = circuitJson.find((element) => element.type === "source_port")
  if (port?.type !== "source_port") throw new Error("Missing test port")
  return port
}

function getLiteral(config: SysConfig, target: string) {
  const expression = config.getAssignment(target)?.value
  if (!(expression instanceof SysConfigLiteral))
    throw new Error(`Missing literal ${target}`)
  return expression.value
}

test("constructs a target-selected GPIO document from schema-valid Circuit JSON", () => {
  const config = convertCircuitJsonToSysConfig(createCircuit(), options)
  expect(config).toBeInstanceOf(SysConfig)
  expect(config.modules.map((module) => module.modulePath)).toEqual([
    "/drivers/gpio/gpio",
    "/kernel/dpl/debug_log",
  ])
  expect(config.instances).toHaveLength(1)
  expect(config.instances[0]?.moduleName).toBe("gpio")
  expect(getLiteral(config, "gpio1.$name")).toBe("GPIO_LED")
  expect(getLiteral(config, "gpio1.pinDir")).toBe("OUTPUT")
  expect(getLiteral(config, "gpio1.useMcuDomainPeripherals")).toBe(true)
  expect(getLiteral(config, "gpio1.MCU_GPIO.$assign")).toBe("MCU_GPIO0")
  expect(getLiteral(config, "gpio1.MCU_GPIO.gpioPin.$assign")).toBe("A7")
  expect(getLiteral(config, "debug_log.enableUartLog")).toBe(false)
  expect(config.getString()).toContain(
    '--device "AM243x_ALV_beta" --package "ALV" --part "ALV" --context "r5fss0-0" --product "MCU_PLUS_SDK@07.03.01"',
  )
  expect(config.getString()).not.toContain("mpu_armv7")
  expect(config.getString()).not.toContain("uartLog.")
  const reparsed = parseSysConfig(config.getString())
  expect(reparsed.unknownNodes).toHaveLength(0)
  expect(reparsed.getString()).toBe(config.getString())
})

test("changing only the circuit ball A7 → B7 changes the fixed assignment", () => {
  const circuitJson = createCircuit()
  const original = convertCircuitJsonToSysConfig(
    circuitJson,
    options,
  ).getString()
  getPort(circuitJson).port_hints = ["B7"]
  const config = convertCircuitJsonToSysConfig(circuitJson, options)
  expect(getLiteral(config, "gpio1.MCU_GPIO.gpioPin.$assign")).toBe("B7")
  expect(config.getString()).toBe(original.replace('"A7"', '"B7"'))
})

test("firmware name is supplied by the request", () => {
  const config = convertCircuitJsonToSysConfig(createCircuit(), {
    ...options,
    gpio_name: "STATUS_LED",
  })
  expect(getLiteral(config, "gpio1.$name")).toBe("STATUS_LED")
})

test("deterministic conversion leaves Circuit JSON and options unchanged", () => {
  const circuitJson = createCircuit()
  const original = structuredClone(circuitJson)
  const originalOptions = structuredClone(options)
  const first = convertCircuitJsonToSysConfig(circuitJson, options).getString()
  expect(convertCircuitJsonToSysConfig(circuitJson, options).getString()).toBe(
    first,
  )
  expect(circuitJson).toEqual(original)
  expect(options).toEqual(originalOptions)
})

for (const portOverrides of [
  { name: "A7", port_hints: [] },
  {
    name: "A7",
    port_hints: ["A7", "MCU_SPI1_CS0", "MCU_GPIO0_5", "pin42", "42"],
    pin_number: 42,
  },
]) {
  test("accepts an exact ball name/alias independently of numeric pin_number", () => {
    const circuitJson = createCircuit()
    Object.assign(getPort(circuitJson), portOverrides)
    expect(
      getLiteral(
        convertCircuitJsonToSysConfig(circuitJson, options),
        "gpio1.MCU_GPIO.gpioPin.$assign",
      ),
    ).toBe("A7")
  })
}

for (const [portOverrides, diagnostic] of [
  [{ port_hints: [] }, "unambiguous package-ball"],
  [
    { name: "LED at A7", port_hints: ["pin7"], pin_number: 7 },
    "unambiguous package-ball",
  ],
  [{ port_hints: ["MCU_GPIO0_5"] }, "unambiguous package-ball"],
  [{ port_hints: ["A7", "B7"] }, "unambiguous package-ball"],
  [{ name: "B7", port_hints: ["A7"] }, "unambiguous package-ball"],
  [{ port_hints: ["C7"] }, "Unsupported GPIO ball C7"],
  [{ port_hints: ["A7", "C7"] }, "unambiguous package-ball"],
  [{ port_hints: ["A7", "MCU_SPI1_CS1"] }, "signal alias conflicts"],
  [{ name: "MCU_GPIO0_6", port_hints: ["A7"] }, "signal alias conflicts"],
  [{ source_component_id: "another_mcu" }, "does not belong"],
  [{ source_component_id: undefined }, "does not belong"],
] satisfies [Partial<SourcePort>, string][]) {
  test(`rejects port identity: ${JSON.stringify(portOverrides)}`, () => {
    const circuitJson = createCircuit()
    Object.assign(getPort(circuitJson), portOverrides)
    expect(() => convertCircuitJsonToSysConfig(circuitJson, options)).toThrow(
      diagnostic,
    )
  })
}

for (const attribute of [
  "is_configured_for_uart_tx",
  "is_configured_for_uart_rx",
  "is_configured_for_i2c_sda",
  "is_configured_for_i2c_scl",
  "is_configured_for_spi_mosi",
  "is_configured_for_spi_miso",
  "is_configured_for_spi_sck",
  "is_configured_for_spi_cs",
  "do_not_connect",
  "provides_ground",
  "requires_ground",
  "provides_power",
  "requires_power",
  "is_using_internal_pullup",
  "is_using_internal_pulldown",
  "is_using_open_drain",
  "is_using_push_pull",
] as const) {
  test(`rejects unsupported active attribute ${attribute}`, () => {
    const circuitJson = createCircuit()
    getPort(circuitJson)[attribute] = true
    expect(() => convertCircuitJsonToSysConfig(circuitJson, options)).toThrow(
      attribute,
    )
  })
}

test("capabilities and explicitly inactive functions do not select a peripheral", () => {
  const circuitJson = createCircuit()
  Object.assign(getPort(circuitJson), {
    supports_spi_cs: true,
    is_configured_for_spi_cs: false,
  })
  expect(
    getLiteral(
      convertCircuitJsonToSysConfig(circuitJson, options),
      "gpio1.pinDir",
    ),
  ).toBe("OUTPUT")
})

describe("identity conflicts", () => {
  for (const otherPort of [
    { name: "A7", port_hints: [] },
    { name: "OTHER", port_hints: ["A7"] },
    { name: "MCU_SPI1_CS0", port_hints: [] },
    { name: "OTHER", port_hints: ["MCU_GPIO0_5"] },
    { name: "B7", port_hints: [], pin_number: 42 },
  ]) {
    test("rejects another MCU port claiming the same ball or ordinal", () => {
      const circuitJson = createCircuit()
      getPort(circuitJson).pin_number = 42
      circuitJson.push({
        ...getPort(circuitJson),
        ...otherPort,
        source_port_id: "duplicate",
      })
      expect(() => convertCircuitJsonToSysConfig(circuitJson, options)).toThrow(
        "Conflicting pin identity",
      )
    })
  }
  test("does not confuse the same ball on different components", () => {
    const circuitJson = createCircuit()
    circuitJson.push({
      ...getPort(circuitJson),
      source_port_id: "other_port",
      source_component_id: "other_mcu",
    })
    expect(() =>
      convertCircuitJsonToSysConfig(circuitJson, options),
    ).not.toThrow()
  })
  test("rejects duplicate source_port_id", () => {
    const circuitJson = createCircuit()
    circuitJson.push({ ...getPort(circuitJson) })
    expect(() => convertCircuitJsonToSysConfig(circuitJson, options)).toThrow(
      "found 2",
    )
  })
  test("rejects missing source_port_id", () => {
    expect(() =>
      convertCircuitJsonToSysConfig(createCircuit(), {
        ...options,
        source_port_id: "missing",
      }),
    ).toThrow("found 0")
  })
})

for (const gpio_name of ["", "bad name", "LED;break", "1LED", "lowercase"]) {
  test(`rejects invalid firmware name ${JSON.stringify(gpio_name)}`, () => {
    expect(() =>
      convertCircuitJsonToSysConfig(createCircuit(), { ...options, gpio_name }),
    ).toThrow("uppercase C identifier")
  })
}

test("rejects unsupported direction at the JavaScript boundary", () => {
  const invalidOptions = JSON.parse(
    JSON.stringify({ ...options, direction: "input" }),
  )
  expect(() =>
    convertCircuitJsonToSysConfig(createCircuit(), invalidOptions),
  ).toThrow("Only GPIO direction output")
})

test("uses the actual schema to reject a string pin_number", () => {
  const invalidCircuit = JSON.parse(JSON.stringify(createCircuit()))
  invalidCircuit[1].pin_number = "A7"
  expect(() => convertCircuitJsonToSysConfig(invalidCircuit, options)).toThrow(
    "pin_number",
  )
})

for (const gpio_name of [["GPIO_LED"], {}, 123, true, false, null, undefined]) {
  test(`rejects non-string runtime GPIO name ${JSON.stringify(gpio_name)}`, () => {
    // Exercise a JSON caller's boundary, including an omitted name, without casts.
    const runtimeOptions = JSON.parse(JSON.stringify({ ...options, gpio_name }))
    expect(() =>
      convertCircuitJsonToSysConfig(createCircuit(), runtimeOptions),
    ).toThrow("gpio_name must be a string")
  })
}

for (const portOverrides of [
  { name: "CS1", port_hints: ["B7"] },
  { name: "GPIO_OUTPUT", port_hints: ["B7", "CS1"] },
]) {
  test(`recognizes a B7 ball alongside signal alias ${JSON.stringify(portOverrides)}`, () => {
    const circuitJson = createCircuit()
    Object.assign(getPort(circuitJson), portOverrides)
    expect(
      getLiteral(
        convertCircuitJsonToSysConfig(circuitJson, options),
        "gpio1.MCU_GPIO.gpioPin.$assign",
      ),
    ).toBe("B7")
  })
}

for (const ball of ["A1", "C7", "AA21", "Y20"]) {
  test(`rejects a conflicting real ALV package ball ${ball}`, () => {
    const circuitJson = createCircuit()
    getPort(circuitJson).port_hints = ["B7", ball]
    expect(() => convertCircuitJsonToSysConfig(circuitJson, options)).toThrow(
      "unambiguous package-ball",
    )
  })
}

for (const label of [
  "CS1",
  "A0",
  "A22",
  "AA22",
  "AB1",
  "I1",
  "O1",
  "Q1",
  "S1",
  "X1",
  "Z1",
]) {
  test(`does not interpret ${label} as a physical ALV ball`, () => {
    const circuitJson = createCircuit()
    getPort(circuitJson).port_hints = [label]
    expect(() => convertCircuitJsonToSysConfig(circuitJson, options)).toThrow(
      "unambiguous package-ball",
    )
  })
}
