import { SysConfig, SysConfigTrivia } from "sysconfigts"
import { cc2340r5rge } from "../targets/cc2340r5rge"
import type { ResolvedCc2340Requests } from "./resolve-requests"

const pulls = { none: "None", up: "Pull Up", down: "Pull Down" } as const
const interrupts = {
  none: "None",
  falling: "Falling Edge",
  rising: "Rising Edge",
  both: "Both Edges",
} as const

export function buildCc2340SysConfig(
  resolved: ResolvedCc2340Requests,
): SysConfig {
  const config = new SysConfig()
  if (resolved.gpios.length)
    config.addModule({ name: "GPIO", modulePath: "/ti/drivers/GPIO" })
  for (const [index, { request, pin }] of resolved.gpios.entries()) {
    const instance = `GPIO${index + 1}`
    config.addInstance({ name: instance, moduleName: "GPIO" })
    config.setValue(`${instance}.$name`, request.gpio_name)
    config.setValue(
      `${instance}.mode`,
      request.direction === "output" ? "Output" : "Input",
    )
    if (request.direction === "output") {
      config.setValue(
        `${instance}.initialOutputState`,
        request.initial_state === "high" ? "High" : "Low",
      )
      config.setValue(`${instance}.outputType`, "Standard")
      config.setValue(`${instance}.pull`, "None")
      config.setValue(`${instance}.interruptTrigger`, "None")
    } else {
      config.setValue(`${instance}.pull`, pulls[request.pull])
      config.setValue(
        `${instance}.interruptTrigger`,
        interrupts[request.interrupt],
      )
    }
    config.setValue(`${instance}.gpioPin.$assign`, pin.identifier)
  }
  if (resolved.i2c) {
    const { request, sda, scl } = resolved.i2c
    config.addModule({
      name: "I2C",
      modulePath: "/ti/drivers/I2C",
      arguments: [{}, false],
    })
    config.addInstance({ name: "I2C1", moduleName: "I2C" })
    config.setValue("I2C1.$name", request.i2c_name)
    config.setValue("I2C1.maxBitRate", request.max_bit_rate)
    config.setValue("I2C1.i2c.sdaPin.$assign", sda.identifier)
    config.setValue("I2C1.i2c.sclPin.$assign", scl.identifier)
    config.setValue(
      `I2C1.i2c.${request.peripheral_assignment === "fixed" ? "$assign" : "$suggestSolution"}`,
      cc2340r5rge.i2c.peripheral,
    )
  }
  config.nodes.unshift(
    new SysConfigTrivia({
      text: `/**\n * @cliArgs --device "CC2340R5RGE" --part "Default" --package "RGE" --rtos "${resolved.options.firmware.rtos}" --product "simplelink_lowpower_f3_sdk@9.21.00.36"\n * @v2CliArgs --device "CC2340R5" --package "VQFN (RGE)" --rtos "${resolved.options.firmware.rtos}" --product "simplelink_lowpower_f3_sdk@9.21.00.36"\n */\n`,
    }),
  )
  return config
}
