import type { CircuitJson } from "circuit-json"
import type { SysConfig } from "sysconfigts"
import { CircuitJsonToSysConfigConverter } from "./CircuitJsonToSysConfigConverter"
import type { GpioRequest } from "./gpio/resolve-gpio-request"

export type ConvertCircuitJsonToSysConfigOptions = GpioRequest

export function convertCircuitJsonToSysConfig(
  circuitJson: CircuitJson,
  options: ConvertCircuitJsonToSysConfigOptions,
): SysConfig {
  const converter = new CircuitJsonToSysConfigConverter(circuitJson, options)
  converter.runUntilFinished()
  return converter.getOutput()
}
