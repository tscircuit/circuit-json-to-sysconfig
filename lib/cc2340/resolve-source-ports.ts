import {
  type CircuitJson,
  type SourcePort,
  type SourceSimpleChip,
  source_port,
} from "circuit-json"

/** Missing connected ports must not disappear from a derived configuration. */
export function resolveCc2340SourcePorts(
  component: SourceSimpleChip,
  ctx: { circuitJson: CircuitJson },
): SourcePort[] {
  const sourcePorts = ctx.circuitJson.filter(
    (element) => element.type === "source_port",
  )
  const sourcePortIds = new Set(sourcePorts.map((port) => port.source_port_id))
  const missing = ctx.circuitJson.flatMap((element) =>
    element.type === "source_trace"
      ? [...new Set(element.connected_source_port_ids)]
          .filter((source_port_id) => !sourcePortIds.has(source_port_id))
          .map(
            (source_port_id) =>
              `${element.source_trace_id}: missing source_port ${source_port_id}`,
          )
      : [],
  )
  if (missing.length)
    throw new Error(
      `Incomplete Circuit JSON pin records:\n${missing.sort().join("\n")}\nRebuild the circuit so every connected pin has a source_port record before generating SysConfig.`,
    )
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
      `${component.name} (${component.source_component_id}, ${component.manufacturer_part_number}): no source_port records. Rebuild the circuit with the MCU's physical pins and pinAttributes before generating SysConfig.`,
    )
  return ports
}
