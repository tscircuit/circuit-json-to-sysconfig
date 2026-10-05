import type { CircuitJson } from "circuit-json"
import type { SysConfig } from "sysconfigts"
import type { ConvertContext, ConvertOptions } from "./ConvertContext"
import type { ResolvedSysConfigConfiguration } from "./ResolvedSysConfigConfiguration"
import { buildSysConfigStage } from "./stages/build-sysconfig-stage"
import { resolveGpioStage } from "./stages/resolve-gpio-stage"
import { resolveTargetStage } from "./stages/resolve-target-stage"

const stages = [
  resolveTargetStage,
  resolveGpioStage,
  buildSysConfigStage,
] as const

export class CircuitJsonToSysConfigConverter {
  private readonly ctx: ConvertContext
  private currentStageIndex = 0

  constructor(circuitJson: CircuitJson, options: ConvertOptions = {}) {
    if (!options || Object.getPrototypeOf(options) !== Object.prototype)
      throw new Error("Options must be a plain configuration object")
    this.ctx = {
      circuitJson: structuredClone(circuitJson),
      options: structuredClone(options),
    }
  }

  get finished(): boolean {
    return this.currentStageIndex === stages.length
  }

  /** Resolve target, resolve peripheral requests, or build the document. */
  step(): void {
    const stage = stages[this.currentStageIndex]
    if (!stage) return
    stage(this.ctx)
    this.currentStageIndex++
  }

  runUntilFinished(): void {
    while (!this.finished) this.step()
  }

  getOutput(): SysConfig {
    if (!this.finished || !this.ctx.config)
      throw new Error("Converter must finish before its output is read")
    return this.ctx.config
  }

  getResolvedConfiguration(): ResolvedSysConfigConfiguration {
    if (!this.finished || !this.ctx.target || !this.ctx.selectedComponent)
      throw new Error("Converter must finish before its configuration is read")
    const configuration = {
      target: this.ctx.target,
      component: this.ctx.selectedComponent,
    }
    if (this.ctx.cc2340Requests)
      return structuredClone({
        ...configuration,
        cc2340: this.ctx.cc2340Requests,
      })
    if (this.ctx.selectedPort && this.ctx.gpioRequest)
      return structuredClone({
        ...configuration,
        gpio: {
          source_component_id: this.ctx.selectedComponent.source_component_id,
          source_port_id: this.ctx.selectedPort.source_port_id,
          gpio_name: this.ctx.gpioRequest.gpio_name,
          direction: this.ctx.gpioRequest.direction,
        },
      })
    throw new Error(
      "Finished converter has no resolved peripheral configuration",
    )
  }
}
