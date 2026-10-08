import { source_simple_chip } from "circuit-json"
import { z } from "zod"
import type { ConvertContext } from "../ConvertContext"
import { am2434bsdfhialvr } from "../targets/am2434bsdfhialvr"
import { cc2340r5rge } from "../targets/cc2340r5rge"
import { resolveTiTarget } from "../targets/resolve-ti-target"
import { validateCircuitJson } from "../validation/validate-circuit-json"

const selection = z
  .object({ source_component_id: z.string().min(1).optional() })
  .strict()

export function resolveTargetStage(ctx: ConvertContext): void {
  validateCircuitJson(ctx.circuitJson)
  if (!("gpios" in ctx.options) && !("source_port_id" in ctx.options))
    selection.parse(ctx.options)
  const components = ctx.circuitJson.filter(
    (element) =>
      element.type === "source_component" &&
      (ctx.options.source_component_id !== undefined
        ? element.source_component_id === ctx.options.source_component_id
        : element.ftype === "simple_chip" &&
          (element.manufacturer_part_number ===
            cc2340r5rge.manufacturer_part_number ||
            element.manufacturer_part_number ===
              am2434bsdfhialvr.manufacturer_part_number)),
  )
  const component = components[0]
  if (components.length !== 1 || !component) {
    throw new Error(
      `Expected exactly one MCU source_component ${ctx.options.source_component_id ?? "for a supported TI target"}; found ${components.length}. Use source_component_id to select the MCU.`,
    )
  }
  const selectedComponent = source_simple_chip.parse(component)
  if (
    ctx.circuitJson.filter(
      (element) =>
        element.type === "source_component" &&
        element.source_component_id === selectedComponent.source_component_id,
    ).length !== 1
  )
    throw new Error(
      `Duplicate source_component_id ${selectedComponent.source_component_id}`,
    )
  const target = resolveTiTarget(selectedComponent.manufacturer_part_number)
  ctx.selectedComponent = selectedComponent
  ctx.target = target
}
