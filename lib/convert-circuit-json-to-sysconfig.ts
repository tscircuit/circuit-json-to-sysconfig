import type { CircuitJson } from "circuit-json"
import type { SysConfig } from "sysconfigts"
import { CircuitJsonToSysConfigConverter } from "./CircuitJsonToSysConfigConverter"
import type { ConvertOptions } from "./ConvertContext"
import type { FirmwareSelection } from "./derive-options-from-circuit-json"

export type ConvertCircuitJsonToSysConfigOptions =
  | ConvertOptions
  | FirmwareSelection

export function convertCircuitJsonToSysConfig(
  circuitJson: CircuitJson,
  options?: ConvertCircuitJsonToSysConfigOptions,
): SysConfig {
  const converter = new CircuitJsonToSysConfigConverter(circuitJson, options)
  converter.runUntilFinished()
  return converter.getOutput()
}
