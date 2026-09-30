import type { ConvertContext } from "../ConvertContext"
import { resolveCc2340Requests } from "../cc2340/resolve-requests"
import { resolveGpioRequest } from "../gpio/resolve-gpio-request"

export function resolveGpioStage(ctx: ConvertContext): void {
  if (!ctx.target || !ctx.selectedComponent)
    throw new Error("Resolve the MCU target before its GPIO request")
  if ("gpios" in ctx.options) {
    if (ctx.target.manufacturer_part_number !== "CC2340R52E0RGER")
      throw new Error(
        "Multiple GPIO/I2C requests currently require CC2340R52E0RGER",
      )
    ctx.cc2340Requests = resolveCc2340Requests(ctx.options, {
      circuitJson: ctx.circuitJson,
      target: ctx.target,
    })
    return
  }
  if (ctx.target.manufacturer_part_number !== "AM2434BSDFHIALVR")
    throw new Error(
      "The legacy single-output request requires AM2434BSDFHIALVR",
    )
  const { selectedPort, gpioRequest } = resolveGpioRequest(ctx.options, {
    circuitJson: ctx.circuitJson,
    target: ctx.target,
  })
  ctx.selectedPort = selectedPort
  ctx.gpioRequest = gpioRequest
}
