import { am2434bsdfhialvr } from "./am2434bsdfhialvr"
import { cc2340r5rge } from "./cc2340r5rge"
import type { TiTarget } from "./types"

export function resolveTiTarget(
  manufacturer_part_number: "AM2434BSDFHIALVR",
): typeof am2434bsdfhialvr
export function resolveTiTarget(
  manufacturer_part_number: string | undefined,
): TiTarget
export function resolveTiTarget(
  manufacturer_part_number: string | undefined,
): TiTarget {
  if (manufacturer_part_number === am2434bsdfhialvr.manufacturer_part_number)
    return am2434bsdfhialvr
  if (manufacturer_part_number === cc2340r5rge.manufacturer_part_number)
    return cc2340r5rge
  throw new Error(
    `Unsupported manufacturer_part_number ${JSON.stringify(manufacturer_part_number)}; legacy GPIO supports only AM2434BSDFHIALVR (ALV package); multiple GPIO/I2C supports CC2340R52E0RGER (RGE package)`,
  )
}
