import type { SourceSimpleChip } from "circuit-json"
import type { ResolvedCc2340Requests } from "./cc2340/resolve-requests"
import type { GpioRequest } from "./gpio/resolve-gpio-request"
import type { TiTarget } from "./targets/types"

/** Converter declarations for downstream validation, not evaluated SDK defaults. */
export type ResolvedSysConfigConfiguration = {
  target: TiTarget
  component: SourceSimpleChip
} & (
  | { cc2340: ResolvedCc2340Requests; gpio?: never }
  | { gpio: GpioRequest; cc2340?: never }
)
