import type { CircuitJson } from "circuit-json"
import type { SysConfig } from "sysconfigts"
import type { ConvertContext, ConvertOptions } from "./ConvertContext"
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
}
