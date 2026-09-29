import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { any_circuit_element } from "circuit-json"
import { convertCircuitJsonToSysConfig } from "lib/index"
import { inspectSysConfig, parseSysConfig, type SysConfig } from "sysconfigts"
import gpioCircuit from "./fixtures/gpio-circuit.json"

function createConfig(ball: string) {
  const circuitJson = any_circuit_element.array().parse(gpioCircuit)
  const port = circuitJson.find((element) => element.type === "source_port")
  if (!port) throw new Error("Missing GPIO port")
  port.port_hints = [ball]
  return convertCircuitJsonToSysConfig(circuitJson, {
    source_component_id: "mcu",
    source_port_id: port.source_port_id,
    gpio_name: "GPIO_CONVERTED",
    direction: "output",
  })
}

function inspectLines(config: SysConfig) {
  return inspectSysConfig(config).map(
    ({ kind, target, expression }) => `${kind} ${target}: ${expression}`,
  )
}

test("merged sysconfigts inspects the target header and all A7/B7 assignments", () => {
  expect([
    inspectLines(createConfig("A7")),
    inspectLines(createConfig("B7")),
  ]).toMatchInlineSnapshot(`
    [
      [
        "metadata @cliArgs: --device "AM243x_ALV_beta" --package "ALV" --part "ALV" --context "r5fss0-0" --product "MCU_PLUS_SDK@07.03.01"",
        "module gpio: scripting.addModule("/drivers/gpio/gpio", {}, false)",
        "instance gpio1: gpio.addInstance()",
        "assignment gpio1.$name: "GPIO_CONVERTED"",
        "assignment gpio1.pinDir: "OUTPUT"",
        "assignment gpio1.useMcuDomainPeripherals: true",
        "fixed_assignment gpio1.MCU_GPIO.$assign: "MCU_GPIO0"",
        "fixed_assignment gpio1.MCU_GPIO.gpioPin.$assign: "A7"",
        "module debug_log: scripting.addModule("/kernel/dpl/debug_log")",
        "assignment debug_log.enableUartLog: false",
      ],
      [
        "metadata @cliArgs: --device "AM243x_ALV_beta" --package "ALV" --part "ALV" --context "r5fss0-0" --product "MCU_PLUS_SDK@07.03.01"",
        "module gpio: scripting.addModule("/drivers/gpio/gpio", {}, false)",
        "instance gpio1: gpio.addInstance()",
        "assignment gpio1.$name: "GPIO_CONVERTED"",
        "assignment gpio1.pinDir: "OUTPUT"",
        "assignment gpio1.useMcuDomainPeripherals: true",
        "fixed_assignment gpio1.MCU_GPIO.$assign: "MCU_GPIO0"",
        "fixed_assignment gpio1.MCU_GPIO.gpioPin.$assign: "B7"",
        "module debug_log: scripting.addModule("/kernel/dpl/debug_log")",
        "assignment debug_log.enableUartLog: false",
      ],
    ]
  `)
})

for (const ball of ["A7", "B7"]) {
  test(`inspection of ${ball} is deterministic, non-mutating, and preserved by re-parsing`, () => {
    const config = createConfig(ball)
    const source = config.getString()
    const nodes = [...config.nodes]
    const inspection = inspectSysConfig(config)
    expect(inspectSysConfig(config)).toEqual(inspection)
    expect(inspectSysConfig(parseSysConfig(source))).toEqual(inspection)
    expect(config.getString()).toBe(source)
    expect(config.nodes).toHaveLength(nodes.length)
    for (const [index, node] of nodes.entries())
      expect(config.nodes[index]).toBe(node)
  })
}

test("inspection distinguishes the native fixed pins from UART suggestions", () => {
  const source = readFileSync(
    new URL("./fixtures/ti-reference/reference.syscfg", import.meta.url),
    "utf8",
  )
  const config = parseSysConfig(source)
  const pins = inspectSysConfig(config).filter(
    (row) =>
      row.kind === "fixed_assignment" || row.kind === "suggested_assignment",
  )
  expect(pins).toMatchInlineSnapshot(`
    [
      {
        "expression": ""MCU_GPIO0"",
        "kind": "fixed_assignment",
        "target": "gpio1.MCU_GPIO.$assign",
      },
      {
        "expression": ""A7"",
        "kind": "fixed_assignment",
        "target": "gpio1.MCU_GPIO.gpioPin.$assign",
      },
      {
        "expression": ""USART0"",
        "kind": "fixed_assignment",
        "target": "debug_log.uartLog.UART.$assign",
      },
      {
        "expression": ""D15"",
        "kind": "suggested_assignment",
        "target": "debug_log.uartLog.UART.RXD.$suggestSolution",
      },
      {
        "expression": ""C16"",
        "kind": "suggested_assignment",
        "target": "debug_log.uartLog.UART.TXD.$suggestSolution",
      },
    ]
  `)
  expect(config.getString()).toBe(source)
})
