import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { any_circuit_element, type CircuitJson } from "circuit-json"
import { inspectSysConfig, parseSysConfig, SysConfigLiteral } from "sysconfigts"
import { loadPedometerCircuit } from "../examples/pedometer/load-circuit"
import { pedometerOptions } from "../examples/pedometer/options"
import { cc2340Options } from "../lib/cc2340/options"
import {
  type Cc2340Options,
  CircuitJsonToSysConfigConverter,
  convertCircuitJsonToSysConfig,
} from "../lib/index"
import { resolveTiTarget } from "../lib/targets/resolve-ti-target"

const circuit = await loadPedometerCircuit()
function port(circuit: CircuitJson, source_port_id = "source_port_99") {
  const selected = circuit.find(
    (element) =>
      element.type === "source_port" &&
      element.source_port_id === source_port_id,
  )
  if (selected?.type !== "source_port") throw new Error("Missing fixture port")
  return selected
}
function output(options: Cc2340Options = structuredClone(pedometerOptions)) {
  return convertCircuitJsonToSysConfig(circuit, options)
}

test("frozen original Circuit JSON has the recorded build hash", async () => {
  const bytes = await Bun.file(
    new URL("./fixtures/pedometer/circuit.json.txt", import.meta.url),
  ).arrayBuffer()
  expect(createHash("sha256").update(new Uint8Array(bytes)).digest("hex")).toBe(
    "3b28a9019b563bf05aca27cb6d14229b99ab670beeb6243a9e3d16500873205d",
  )
})

test("exact orderable CC2340 MPN resolves to RGE", () => {
  const target = resolveTiTarget("CC2340R52E0RGER")
  expect(target.device).toBe("CC2340R5RGE")
  expect(target.package).toBe("RGE")
  expect(target.product).toBe("simplelink_lowpower_f3_sdk@9.21.00.36")
  for (const mpn of [
    "CC2340R5RGE",
    "CC2340R5",
    "CC2340R52E0RGER.B",
    "cc2340r52e0rger",
    "CC2340R52E0RGERQ1",
  ])
    expect(() => resolveTiTarget(mpn)).toThrow("Unsupported")
})

test("actual board emits three GPIOs and the exact I2C identifiers", () => {
  const config = output()
  expect(config.instances).toHaveLength(4)
  const text = config.getString()
  expect(text).toContain('GPIO1.gpioPin.$assign = "DIO20_A11"')
  expect(text).toContain('GPIO2.gpioPin.$assign = "DIO3_X32P"')
  expect(text).toContain('GPIO3.gpioPin.$assign = "DIO12"')
  expect(text).toContain('I2C1.i2c.sdaPin.$assign = "DIO8"')
  expect(text).toContain('I2C1.i2c.sclPin.$assign = "DIO6_A1_AR+"')
  expect(text).toContain('I2C1.i2c.$suggestSolution = "I2C0"')
  expect(text).not.toContain("I2C1.i2c.$assign")
  expect(text).not.toContain("CONFIG_PMIC_INT")
  expect(text).not.toContain("CONFIG_GAUGE_INT")
  expect(text).not.toContain("CONFIG_BUTTON")
  expect(parseSysConfig(text).getString()).toBe(text)
  expect(inspectSysConfig(config)).toEqual(
    inspectSysConfig(parseSysConfig(text)),
  )
})

test("100000 bits/s becomes numeric 100 kbit/s through serialization and re-parsing", async () => {
  const options = structuredClone(pedometerOptions)
  expect(options.i2c?.max_bit_rate).toBe(100000)
  const config = output(options)
  const source = config.getString()
  expect(source).toContain("I2C1.maxBitRate = 100;")
  const reparsed = parseSysConfig(source)
  expect(reparsed.getString()).toBe(source)
  for (const document of [config, reparsed]) {
    const assignment = document.getAssignment("I2C1.maxBitRate")
    expect(assignment?.value).toBeInstanceOf(SysConfigLiteral)
    if (!(assignment?.value instanceof SysConfigLiteral))
      throw new Error("Expected numeric bitrate literal")
    expect(assignment.value.value).toBe(100)
  }
  // The independently authored board reference must use the same SDK units.
  const reference = parseSysConfig(
    await Bun.file(
      new URL("./fixtures/pedometer/v0.4.4-reference.syscfg", import.meta.url),
    ).text(),
  )
  const assignment = reference.getAssignment("sensorBus.maxBitRate")
  if (!(assignment?.value instanceof SysConfigLiteral))
    throw new Error("Expected numeric reference bitrate literal")
  expect(assignment.value.value).toBe(100)
  expect(options.i2c?.max_bit_rate).toBe(100000)
})

test("firmware settings are explicit; omitted input/output settings fail", () => {
  const text = output().getString()
  expect(text).toContain('GPIO1.initialOutputState = "High"')
  expect(text).toContain('GPIO2.initialOutputState = "Low"')
  expect(text).toContain('GPIO3.mode = "Input"')
  expect(text).toContain('GPIO3.interruptTrigger = "None"')
  expect(text).toContain('GPIO3.pull = "None"')
  expect(text).not.toContain("GPIO3.initialOutputState")
  for (const request of [
    {
      source_port_id: "source_port_99",
      gpio_name: "CONFIG_ACCEL_INT",
      direction: "input",
      pull: "none",
    },
    {
      source_port_id: "source_port_108",
      gpio_name: "CONFIG_PMIC_LP",
      direction: "output",
    },
  ])
    expect(() =>
      cc2340Options.parse({ ...pedometerOptions, gpios: [request] }),
    ).toThrow()
})

test("custom CC2340 startup excludes LaunchPad flash and selects the requested LF clock", () => {
  const text = output().getString()
  expect(text).toContain('scripting.addModule("/ti/drivers/Board")')
  expect(text).toContain("Board.generateInitializationFunctions = false;")
  expect(text).toContain('CCFG.srcClkLF = "LF RCOSC";')
  expect(parseSysConfig(text).getString()).toBe(text)
})

test("requested or reserved crystal pins require an explicit internal LF clock", () => {
  for (const lf_clock_source of [undefined, "lf_xosc"] as const) {
    const options = structuredClone(pedometerOptions)
    options.firmware = { rtos: "nortos", lf_clock_source }
    // The PMIC GPIO uses DIO3_X32P.
    expect(() => output(options)).toThrow('lf_clock_source must be "lf_rcosc"')
    options.gpios = []
    // The display reset reservation independently owns DIO4_X32N.
    expect(() => output(options)).toThrow('lf_clock_source must be "lf_rcosc"')
  }
})

test("external LF crystal is allowed when neither crystal pin is claimed", () => {
  const options = structuredClone(pedometerOptions)
  options.gpios = options.gpios.filter(
    (request) => request.gpio_name !== "CONFIG_PMIC_LP",
  )
  options.reserved_ports = []
  options.firmware.lf_clock_source = "lf_xosc"
  expect(output(options).getString()).toContain('CCFG.srcClkLF = "LF XOSC";')
  delete options.firmware.lf_clock_source
  expect(output(options).getString()).not.toContain("CCFG.srcClkLF")
})

test("GPIO choices and fixed I2C assignment are serialized explicitly", () => {
  const options = structuredClone(pedometerOptions)
  options.gpios = [
    {
      source_port_id: "source_port_99",
      gpio_name: "CONFIG_ACCEL_INT",
      direction: "input",
      pull: "up",
      interrupt: "falling",
    },
  ]
  if (!options.i2c) throw new Error("Missing I2C")
  options.i2c.peripheral_assignment = "fixed"
  const text = output(options).getString()
  expect(text).toContain('GPIO1.pull = "Pull Up"')
  expect(text).toContain('GPIO1.interruptTrigger = "Falling Edge"')
  expect(text).toContain('I2C1.i2c.$assign = "I2C0"')
  expect(text).not.toContain("$suggestSolution")
})

test("display and debug ownership prevents repurposing reserved ports", () => {
  for (const reserved of pedometerOptions.reserved_ports) {
    const options = structuredClone(pedometerOptions)
    options.gpios.push({
      source_port_id: reserved.source_port_id,
      gpio_name: "CONFIG_UNSUPPORTED",
      direction: "input",
      pull: "none",
      interrupt: "none",
    })
    expect(() => output(options)).toThrow("already requested or reserved")
  }
})

test("duplicate names, GPIO pins, GPIO/I2C overlap and SDA/SCL overlap fail", () => {
  const original = structuredClone(pedometerOptions)
  const gpio = original.gpios[0]
  if (!gpio || !original.i2c) throw new Error("Missing example requests")
  const i2c = original.i2c
  expect(() =>
    output({ ...original, gpios: [...original.gpios, gpio] }),
  ).toThrow("already requested")
  expect(() =>
    output({
      ...original,
      gpios: original.gpios.map((request) => ({
        ...request,
        gpio_name: gpio.gpio_name,
      })),
    }),
  ).toThrow("Duplicate instance name")
  expect(() =>
    output({ ...original, i2c: { ...i2c, i2c_name: gpio.gpio_name } }),
  ).toThrow("Duplicate instance name")
  expect(() =>
    output({
      ...original,
      i2c: { ...i2c, sda_source_port_id: gpio.source_port_id },
    }),
  ).toThrow("already requested")
  expect(() =>
    output({
      ...original,
      i2c: {
        ...i2c,
        scl_source_port_id: i2c.sda_source_port_id,
      },
    }),
  ).toThrow("already requested")
})

test("physical number and exact aliases must agree, including plus suffix", () => {
  for (const patch of [
    { pin_number: 2 },
    { pin_number: undefined },
    { name: "DIO13" },
    { port_hints: ["DIO12", "pin6"] },
    { port_hints: ["A7"] },
    { name: "DIO999" },
  ]) {
    const changed = structuredClone(circuit)
    Object.assign(port(changed), patch)
    expect(() =>
      convertCircuitJsonToSysConfig(changed, pedometerOptions),
    ).toThrow()
  }
  const changed = structuredClone(circuit)
  port(changed, "source_port_113").name = "DIO6_A1_AR+"
  expect(
    convertCircuitJsonToSysConfig(changed, pedometerOptions).getString(),
  ).toBe(output().getString())
})

test("duplicate circuit pin identity and cross-component ownership fail", () => {
  const duplicate = structuredClone(circuit)
  duplicate.push({ ...port(duplicate), source_port_id: "duplicate" })
  expect(() =>
    convertCircuitJsonToSysConfig(duplicate, pedometerOptions),
  ).toThrow("Conflicting pin identity")
  for (const id of ["source_port_99", "source_port_97", "source_port_113"]) {
    const changed = structuredClone(circuit)
    port(changed, id).source_component_id = "another_mcu"
    expect(() =>
      convertCircuitJsonToSysConfig(changed, pedometerOptions),
    ).toThrow("does not belong")
  }
})

test("active incompatible functions are rejected; capabilities alone are allowed", () => {
  for (const patch of [
    { is_configured_for_spi_mosi: true },
    { is_configured_for_i2c_sda: true },
    { requires_power: true },
    { is_using_internal_pullup: true },
  ]) {
    const changed = structuredClone(circuit)
    Object.assign(port(changed), patch)
    expect(() =>
      convertCircuitJsonToSysConfig(changed, pedometerOptions),
    ).toThrow("conflicts")
  }
  const changed = structuredClone(circuit)
  port(changed, "source_port_97").is_configured_for_i2c_sda = true
  port(changed, "source_port_113").is_configured_for_i2c_scl = true
  expect(
    convertCircuitJsonToSysConfig(changed, pedometerOptions).getString(),
  ).toBe(output().getString())
  port(changed, "source_port_97").is_configured_for_spi_mosi = true
  expect(() =>
    convertCircuitJsonToSysConfig(changed, pedometerOptions),
  ).toThrow("conflicts")
})

test("unsupported requests and malformed names are rejected at runtime", () => {
  for (const invalid of [
    { ...pedometerOptions, spi: {} },
    { ...pedometerOptions, firmware: { rtos: "freertos", ble: true } },
    {
      ...pedometerOptions,
      gpios: [{ ...pedometerOptions.gpios[0], gpio_name: 42 }],
    },
    {
      ...pedometerOptions,
      gpios: [{ ...pedometerOptions.gpios[0], direction: "spi" }],
    },
    { ...pedometerOptions, i2c: { ...pedometerOptions.i2c, max_bit_rate: 0 } },
  ])
    expect(() => cc2340Options.parse(invalid)).toThrow()
})

test("stages snapshot nested options; instances remain independent and immutable", () => {
  const input = structuredClone(circuit)
  const options = structuredClone(pedometerOptions)
  const before = structuredClone({ input, options })
  const stepped = new CircuitJsonToSysConfigConverter(input, options)
  for (let index = 0; index < 3; index++) {
    expect(stepped.finished).toBe(false)
    expect(() => stepped.getOutput()).toThrow("must finish")
    stepped.step()
  }
  expect(stepped.finished).toBe(true)
  const text = stepped.getOutput().getString()
  expect(text).toBe(output().getString())
  expect({ input, options }).toEqual(before)
  stepped.step()
  expect(stepped.getOutput().getString()).toBe(text)
  const snapshotted = new CircuitJsonToSysConfigConverter(input, options)
  options.gpios.length = 0
  options.reserved_ports.length = 0
  port(input).pin_number = 2
  snapshotted.runUntilFinished()
  expect(snapshotted.getOutput().getString()).toBe(text)
})

test("failed request stage never advances or exposes output", () => {
  const options = structuredClone(pedometerOptions)
  options.gpios[0] = {
    source_port_id: "missing",
    gpio_name: "CONFIG_MISSING",
    direction: "output",
    initial_state: "low",
  }
  const converter = new CircuitJsonToSysConfigConverter(circuit, options)
  converter.step()
  for (let attempt = 0; attempt < 3; attempt++) {
    expect(() => converter.step()).toThrow(
      "Expected exactly one MCU pin record",
    )
    expect(converter.finished).toBe(false)
    expect(() => converter.getOutput()).toThrow("must finish")
  }
})

test("historical unmatched fixture remains byte-identical after parsing", async () => {
  const text = await Bun.file(
    new URL("./fixtures/pedometer/unmatched-reference.syscfg", import.meta.url),
  ).text()
  expect(createHash("sha256").update(text).digest("hex")).toBe(
    "d369b83da1501103629432624e6136fbdc12e3cd30808d22e604c5b4e1f51e7c",
  )
  expect(parseSysConfig(text).getString()).toBe(text)
  expect(text).toContain('GPIO4.gpioPin.$assign = "DIO11"')
  expect(text).toContain('ble.deviceName = "Stride"')
  expect(output().getString()).not.toContain("/ti/ble/ble")
})

test("inspection snapshot distinguishes fixed pins from the suggested peripheral", () => {
  expect(
    inspectSysConfig(output())
      .filter(
        (row) =>
          row.kind === "fixed_assignment" ||
          row.kind === "suggested_assignment",
      )
      .map((row) => `${row.kind} ${row.target}: ${row.expression}`),
  ).toMatchInlineSnapshot(`
    [
      "fixed_assignment GPIO1.gpioPin.$assign: "DIO20_A11"",
      "fixed_assignment GPIO2.gpioPin.$assign: "DIO3_X32P"",
      "fixed_assignment GPIO3.gpioPin.$assign: "DIO12"",
      "fixed_assignment I2C1.i2c.sdaPin.$assign: "DIO8"",
      "fixed_assignment I2C1.i2c.sclPin.$assign: "DIO6_A1_AR+"",
      "suggested_assignment I2C1.i2c.$suggestSolution: "I2C0"",
    ]
  `)
})

test("GPIO-only, I2C-only and caller ordering remain deterministic", () => {
  const options = structuredClone(pedometerOptions)
  expect(output({ ...options, gpios: [] }).instances).toHaveLength(1)
  expect(output({ ...options, i2c: undefined }).instances).toHaveLength(3)
  const reversed = output({
    ...options,
    gpios: [...options.gpios].reverse(),
  }).getString()
  expect(reversed).toContain('GPIO1.$name = "CONFIG_ACCEL_INT"')
  expect(reversed).toContain('GPIO1.gpioPin.$assign = "DIO12"')
  expect(reversed).toContain('GPIO3.$name = "CONFIG_DISPLAY_ISOLATE"')
  expect(() => output({ ...options, gpios: [], i2c: undefined })).toThrow(
    "At least one",
  )
})

test("unsupported I2C routes and duplicate reservation declarations fail", () => {
  const options = structuredClone(pedometerOptions)
  const i2c = options.i2c
  const reserved = options.reserved_ports[0]
  if (!i2c || !reserved) throw new Error("Missing fixture request")
  expect(() =>
    output({
      ...options,
      gpios: [],
      i2c: { ...i2c, sda_source_port_id: "source_port_99" },
    }),
  ).toThrow("Unsupported I2C0 pin pair")
  expect(() =>
    output({
      ...options,
      reserved_ports: [...options.reserved_ports, reserved],
    }),
  ).toThrow("Duplicate reserved")
})

test("a real TSX pin change changes the output with identical request options", async () => {
  const options: Cc2340Options = {
    source_component_id: "source_component_0",
    gpios: [
      {
        source_port_id: "source_port_0",
        gpio_name: "CONFIG_SIGNAL",
        direction: "output",
        initial_state: "low",
      },
    ],
    reserved_ports: [],
    firmware: { rtos: "nortos" },
  }
  for (const [physicalPin, identifier] of [
    [5, "DIO12"],
    [6, "DIO13"],
  ] as const) {
    const input = any_circuit_element
      .array()
      .parse(
        await Bun.file(
          new URL(
            `./fixtures/cc2340-pin-change/pin${physicalPin}.circuit.json.txt`,
            import.meta.url,
          ),
        ).json(),
      )
    expect(port(input, "source_port_0").pin_number).toBe(physicalPin)
    expect(convertCircuitJsonToSysConfig(input, options).getString()).toContain(
      `GPIO1.gpioPin.$assign = "${identifier}"`,
    )
  }
})
