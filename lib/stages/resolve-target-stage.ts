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
  if ("gpios" in ctx.options) {
    if (
      selectedComponent.firmware_rtos !== undefined &&
      selectedComponent.firmware_rtos !== ctx.options.firmware.rtos
    )
      throw new Error(
        `MCU ${selectedComponent.name}: firmware_rtos conflicts with the request`,
      )
    const declaredClock = selectedComponent.firmware_lf_clock_source
    if (
      declaredClock !== undefined &&
      (declaredClock === "internal_rc" ? "lf_rcosc" : "lf_xosc") !==
        ctx.options.firmware.lf_clock_source
    )
      throw new Error(
        `MCU ${selectedComponent.name}: firmware_lf_clock_source conflicts with the request`,
      )
  } else if (
    selectedComponent.firmware_rtos !== undefined ||
    selectedComponent.firmware_lf_clock_source !== undefined
  ) {
    throw new Error(
      "The legacy AM2434 request cannot represent declared MCU firmware settings",
    )
  }
  ctx.selectedComponent = selectedComponent
  ctx.target = target
}
