import {
  type CircuitJson,
  type SourcePort,
  type SourceSimpleCrystal,
  source_simple_crystal,
} from "circuit-json"
import { getSourcePortConnectivityMapFromCircuitJson } from "circuit-json-to-connectivity-map"
import type { Cc2340Target } from "../targets/cc2340r5rge"

/** Recognize a crystal from electrical connectivity, independent of signal names. */
export function resolveCc2340LfCrystal(
  ports: SourcePort[],
  ctx: { circuitJson: CircuitJson; target: Cc2340Target },
): SourceSimpleCrystal | undefined {
  const positive = ports.find(
    (port) => port.pin_number === ctx.target.lfCrystalPins[0],
  )
  const negative = ports.find(
    (port) => port.pin_number === ctx.target.lfCrystalPins[1],
  )
  if (!positive || !negative) return undefined
  const connectivity = getSourcePortConnectivityMapFromCircuitJson(
    ctx.circuitJson,
  )
  if (
    connectivity.areIdsConnected(
      positive.source_port_id,
      negative.source_port_id,
    )
  )
    throw new Error("LF crystal pins 14/15 are on the same electrical net")
  const crystals = ctx.circuitJson.filter(
    (element) =>
      element.type === "source_component" && element.ftype === "simple_crystal",
  )
  const sourcePorts = ctx.circuitJson.filter(
    (element) => element.type === "source_port",
  )
  const matches = crystals.filter((crystal) => {
    const terminals = sourcePorts.filter(
      (element) => element.source_component_id === crystal.source_component_id,
    )
    return [positive, negative].every((mcuPort) =>
      terminals.some((terminal) =>
        connectivity.areIdsConnected(
          mcuPort.source_port_id,
          terminal.source_port_id,
        ),
      ),
    )
  })
  if (!matches.length) return undefined
  if (matches.length !== 1)
    throw new Error("LF crystal pins 14/15 connect to multiple crystals")
  const crystal = source_simple_crystal.parse(matches[0])
  const terminals = sourcePorts.filter(
    (element) => element.source_component_id === crystal.source_component_id,
  )
  if (
    crystal.pin_variant !== "two_pin" ||
    terminals.length !== 2 ||
    new Set(terminals.map((port) => port.source_port_id)).size !== 2
  )
    throw new Error(
      `${crystal.name}: LF crystal support requires exactly two distinct terminals`,
    )
  if (crystal.frequency !== ctx.target.lfCrystalFrequencyHz)
    throw new Error(
      `${crystal.name}: LF crystal must specify ${ctx.target.lfCrystalFrequencyHz} Hz; received ${crystal.frequency} Hz`,
    )
  if (
    ports.some(
      (port) =>
        port !== positive &&
        port !== negative &&
        [positive, negative].some((mcuPort) =>
          connectivity.areIdsConnected(
            port.source_port_id,
            mcuPort.source_port_id,
          ),
        ),
    )
  )
    throw new Error("LF crystal nets also connect to another MCU pin")
  return crystal
}
