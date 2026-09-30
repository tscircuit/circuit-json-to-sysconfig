import { SysConfig, SysConfigTrivia } from "sysconfigts"
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
  const { target } = resolved
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
    // Public API uses bits/s; the SimpleLink SDK property uses kbit/s.
    config.setValue("I2C1.maxBitRate", request.max_bit_rate / 1000)
    config.setValue("I2C1.i2c.sdaPin.$assign", sda.identifier)
    config.setValue("I2C1.i2c.sclPin.$assign", scl.identifier)
    config.setValue(
      `I2C1.i2c.${request.peripheral_assignment === "fixed" ? "$assign" : "$suggestSolution"}`,
      target.i2c.peripheral,
    )
  }
  config.nodes.unshift(
    new SysConfigTrivia({
      text: `/**\n * @cliArgs --device "${target.device}" --part "${target.part}" --package "${target.package}" --rtos "${resolved.options.firmware.rtos}" --product "${target.product}"\n * @v2CliArgs --device "${target.v2.device}" --package "${target.v2.package}" --rtos "${resolved.options.firmware.rtos}" --product "${target.product}"\n */\n`,
    }),
  )
  return config
}
