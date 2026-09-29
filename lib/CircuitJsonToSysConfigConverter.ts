import type { CircuitJson } from "circuit-json"
import type { SysConfig } from "sysconfigts"
import type { ConvertContext } from "./ConvertContext"
import type { GpioRequest } from "./gpio/resolve-gpio-request"
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

  constructor(circuitJson: CircuitJson, options: GpioRequest) {
    this.ctx = {
      circuitJson: structuredClone(circuitJson),
      options: structuredClone(options),
    }
  }

  get finished(): boolean {
    return this.currentStageIndex === stages.length
  }

  /** Resolve target, resolve GPIO, or build the document: one whole stage per call. */
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
