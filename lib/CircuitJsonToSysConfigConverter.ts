import type { CircuitJson } from "circuit-json"
import type { SysConfig } from "sysconfigts"
import type { ConvertContext, ConvertOptions } from "./ConvertContext"
import {
  deriveOptionsFromCircuitJson,
  type FirmwareSelection,
} from "./derive-options-from-circuit-json"
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

  constructor(
    circuitJson: CircuitJson,
    options?: ConvertOptions | FirmwareSelection,
  ) {
    if (
      options !== undefined &&
      (!options || Object.getPrototypeOf(options) !== Object.prototype)
    )
      throw new Error("Options must be a plain configuration object")
    const circuitSnapshot = structuredClone(circuitJson)
    this.ctx = {
      circuitJson: circuitSnapshot,
      options:
        options && ("gpios" in options || "source_port_id" in options)
          ? structuredClone(options)
          : deriveOptionsFromCircuitJson(circuitSnapshot, options),
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

  /** The validated request used by this conversion, for downstream TI result checks. */
  getResolvedOptions(): ConvertOptions {
    if (!this.finished)
      throw new Error("Converter must finish before its options are read")
    return structuredClone(this.ctx.options)
  }
}
