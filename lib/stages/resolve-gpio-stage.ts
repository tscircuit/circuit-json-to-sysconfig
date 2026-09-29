import type { ConvertContext } from "../ConvertContext"
import { resolveGpioRequest } from "../gpio/resolve-gpio-request"

export function resolveGpioStage(ctx: ConvertContext): void {
  if (!ctx.target || !ctx.selectedComponent)
    throw new Error("Resolve the MCU target before its GPIO request")
  const { selectedPort, gpioRequest } = resolveGpioRequest(ctx.options, {
    circuitJson: ctx.circuitJson,
    target: ctx.target,
  })
  ctx.selectedPort = selectedPort
  ctx.gpioRequest = gpioRequest
}
