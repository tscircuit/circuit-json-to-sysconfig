import {
  type CircuitJson,
  type SourcePort,
  type SourceSimpleChip,
  source_port,
} from "circuit-json"

import { formatCc2340Component, formatCc2340Pin } from "./format-pin-label"

/** Missing connected ports must not disappear from a derived configuration. */
export function resolveCc2340SourcePorts(
  component: SourceSimpleChip,
  ctx: { circuitJson: CircuitJson },
): SourcePort[] {
  const sourcePorts = ctx.circuitJson.filter(
    (element) => element.type === "source_port",
  )
  const sourcePortIds = new Set(sourcePorts.map((port) => port.source_port_id))
  const incompleteTraces = ctx.circuitJson.filter(
    (element) =>
      element.type === "source_trace" &&
      element.connected_source_port_ids.some(
        (source_port_id) => !sourcePortIds.has(source_port_id),
      ),
  )
  if (incompleteTraces.length) {
    const knownPins = sourcePorts.filter((port) =>
      incompleteTraces.some(
        (trace) =>
          trace.type === "source_trace" &&
          trace.connected_source_port_ids.includes(port.source_port_id),
      ),
    )
    throw new Error(
      `Incomplete Circuit JSON pin records: ${incompleteTraces.length} connection(s) reference missing pins.${knownPins.length ? `\nAffected connected pins: ${knownPins.map((port) => formatCc2340Pin(port, ctx)).join(", ")}.` : ""}\nRebuild the circuit so every connected pin has a source_port record before generating SysConfig.`,
    )
  }
  const ports = sourcePorts
    .filter(
      (port) => port.source_component_id === component.source_component_id,
    )
    .map((port) => source_port.parse(port))
    .sort(
      (a, b) =>
        (a.pin_number ?? Infinity) - (b.pin_number ?? Infinity) ||
        a.source_port_id.localeCompare(b.source_port_id),
    )
  if (!ports.length)
    throw new Error(
      `${formatCc2340Component(component)}: no MCU pin records (source_port). Rebuild the circuit with the MCU's physical pins and pinAttributes before generating SysConfig.`,
    )
  return ports
}
