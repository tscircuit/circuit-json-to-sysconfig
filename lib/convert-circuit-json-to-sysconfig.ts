import { type CircuitJson, source_simple_chip } from "circuit-json"
import { SysConfig, SysConfigTrivia } from "sysconfigts"
import { addGpioConfiguration } from "./gpio/add-gpio-configuration"
import {
  type GpioRequest,
  resolveGpioRequest,
} from "./gpio/resolve-gpio-request"
import { resolveTiTarget } from "./targets/am2434bsdfhialvr"

export type ConvertCircuitJsonToSysConfigOptions = GpioRequest

export function convertCircuitJsonToSysConfig(
  circuitJson: CircuitJson,
  options: ConvertCircuitJsonToSysConfigOptions,
): SysConfig {
  const components = circuitJson.filter(
    (element) =>
      element.type === "source_component" &&
      element.source_component_id === options.source_component_id,
  )
  const component = components[0]
  if (components.length !== 1 || !component) {
    throw new Error(
      `Expected exactly one MCU source_component ${options.source_component_id}; found ${components.length}`,
    )
  }
  const chip = source_simple_chip.parse(component)
  const target = resolveTiTarget(chip.manufacturer_part_number)
  const gpioRequest = resolveGpioRequest(circuitJson, options)
  const config = new SysConfig()
  addGpioConfiguration(config, gpioRequest)
  // The SDK's mandatory system module loads debug_log. Explicitly reserve no UART pins.
  config.addModule({ name: "debug_log", modulePath: "/kernel/dpl/debug_log" })
  config.setValue("debug_log.enableUartLog", false)
  config.nodes.unshift(
    new SysConfigTrivia({
      text: `/**\n * @cliArgs --device "${target.device}" --package "${target.package}" --part "${target.part}" --context "${target.context}" --product "${target.product}"\n */\n`,
    }),
  )
  return config
}
