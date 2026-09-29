import type { CircuitJson, SourcePort, SourceSimpleChip } from "circuit-json"
import type { SysConfig } from "sysconfigts"
import type {
  GpioRequest,
  ResolvedGpioRequest,
} from "./gpio/resolve-gpio-request"
import type { TiTarget } from "./targets/am2434bsdfhialvr"

export interface ConvertContext {
  circuitJson: CircuitJson
  options: GpioRequest
  target?: TiTarget
  selectedComponent?: SourceSimpleChip
  selectedPort?: SourcePort
  gpioRequest?: ResolvedGpioRequest
  config?: SysConfig
}
