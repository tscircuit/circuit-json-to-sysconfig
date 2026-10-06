import type { CircuitJson, SourcePort, SourceSimpleChip } from "circuit-json"

export function formatCc2340Component(component: SourceSimpleChip): string {
  return `${component.name} (${component.manufacturer_part_number})`
}

/** Show circuit names and physical pins, never generated record IDs. */
export function formatCc2340Pin(
  port: SourcePort,
  ctx: { circuitJson: CircuitJson },
): string {
  const component = ctx.circuitJson.find(
    (element) =>
      element.type === "source_component" &&
      element.source_component_id === port.source_component_id,
  )
  const componentName =
    component?.type === "source_component" ? component.name : "MCU"
  return `${componentName} pin ${port.pin_number ?? "unspecified"} (${port.name})`
}
