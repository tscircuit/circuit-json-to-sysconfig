import type { CircuitJson, SourcePort, SourceSimpleChip } from "circuit-json"
import type { SysConfig } from "sysconfigts"
import type { Cc2340Options } from "./cc2340/options"
import type { ResolvedCc2340Requests } from "./cc2340/resolve-requests"
import type {
  GpioRequest,
  ResolvedGpioRequest,
} from "./gpio/resolve-gpio-request"
import type { TiTarget } from "./targets/types"

export type ConvertOptions = GpioRequest | Cc2340Options

export interface ConvertContext {
  circuitJson: CircuitJson
  options: ConvertOptions
  target?: TiTarget
  selectedComponent?: SourceSimpleChip
  selectedPort?: SourcePort
  gpioRequest?: ResolvedGpioRequest
  cc2340Requests?: ResolvedCc2340Requests
  config?: SysConfig
}
