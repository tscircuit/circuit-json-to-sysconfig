import { source_simple_chip } from "circuit-json"
import type { ConvertContext } from "../ConvertContext"
import { resolveTiTarget } from "../targets/resolve-ti-target"

export function resolveTargetStage(ctx: ConvertContext): void {
  const components = ctx.circuitJson.filter(
    (element) =>
      element.type === "source_component" &&
      element.source_component_id === ctx.options.source_component_id,
  )
  const component = components[0]
  if (components.length !== 1 || !component) {
    throw new Error(
      `Expected exactly one MCU source_component ${ctx.options.source_component_id}; found ${components.length}`,
    )
  }
  const selectedComponent = source_simple_chip.parse(component)
  const target = resolveTiTarget(selectedComponent.manufacturer_part_number)
  ctx.selectedComponent = selectedComponent
  ctx.target = target
}
