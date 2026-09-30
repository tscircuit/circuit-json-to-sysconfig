import { SysConfig, SysConfigTrivia } from "sysconfigts"
import type { ConvertContext } from "../ConvertContext"
import { buildCc2340SysConfig } from "../cc2340/build-sysconfig"
import { addGpioConfiguration } from "../gpio/add-gpio-configuration"

export function buildSysConfigStage(ctx: ConvertContext): void {
  if (ctx.cc2340Requests) {
    ctx.config = buildCc2340SysConfig(ctx.cc2340Requests)
    return
  }
  const { target, gpioRequest } = ctx
  if (target?.manufacturer_part_number !== "AM2434BSDFHIALVR" || !gpioRequest)
    throw new Error(
      "Resolve the target and GPIO request before building SysConfig",
    )
  const config = new SysConfig()
  addGpioConfiguration(config, gpioRequest)
  // The SDK's mandatory system module loads debug_log. Explicitly reserve no UART pins.
  config.addModule({ name: "debug_log", modulePath: "/kernel/dpl/debug_log" })
  config.setValue("debug_log.enableUartLog", false)
  config.nodes.unshift(
    new SysConfigTrivia({
      text: `/**\n * @cliArgs --device "${target.device}" --package "${target.package}" --part "${target.part}" --context "${target.context}" --product "${target.product}"\n */\n`,
    }),
  )
  ctx.config = config
}
