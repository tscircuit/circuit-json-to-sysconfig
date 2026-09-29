import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { parseSysConfig, SysConfigLiteral } from "sysconfigts"

const reference = readFileSync(
  new URL("./fixtures/ti-reference/reference.syscfg", import.meta.url),
  "utf8",
)

test("native TI reference parses and serializes byte-for-byte", () => {
  const config = parseSysConfig(reference)
  expect(config.getString()).toBe(reference)
  expect(config.unknownNodes).toHaveLength(0)
  expect(config.modules.map((module) => module.modulePath)).toEqual([
    "/drivers/gpio/gpio",
    "/kernel/dpl/debug_log",
    "/kernel/dpl/mpu_armv7",
  ])
  expect(
    config.instances.find((instance) => instance.name === "gpio1")?.moduleName,
  ).toBe("gpio")
  for (const [target, expected] of [
    ["gpio1.pinDir", "OUTPUT"],
    ["gpio1.useMcuDomainPeripherals", true],
    ["gpio1.MCU_GPIO.$assign", "MCU_GPIO0"],
    ["gpio1.MCU_GPIO.gpioPin.$assign", "A7"],
    ["debug_log.uartLog.UART.RXD.$suggestSolution", "D15"],
    ["debug_log.uartLog.UART.TXD.$suggestSolution", "C16"],
  ] as const) {
    const assignment = config.getAssignment(target)
    expect(assignment?.value).toBeInstanceOf(SysConfigLiteral)
    if (!(assignment?.value instanceof SysConfigLiteral))
      throw new Error(`Expected literal: ${target}`)
    expect(assignment.value.value).toBe(expected)
  }
})

test("renaming the GPIO preserves all unrelated source, including pin assignments", () => {
  const config = parseSysConfig(reference)
  config.setValue("gpio1.$name", "GPIO_REFERENCE_LED")
  const edited = config.getString()
  expect(edited).toBe(reference.replace('"GPIO_LED"', '"GPIO_REFERENCE_LED"'))
  expect(parseSysConfig(edited).getString()).toBe(edited)
})
