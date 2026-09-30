import { convertCircuitJsonToSysConfig } from "../../lib/index"
import { loadPedometerCircuit } from "./load-circuit"
import { pedometerOptions } from "./options"

const config = convertCircuitJsonToSysConfig(
  await loadPedometerCircuit(),
  pedometerOptions,
)
await Bun.write(
  new URL("../../generated/pedometer.syscfg", import.meta.url),
  config.getString(),
)
console.log(
  "Wrote generated/pedometer.syscfg; run bun run validate:cc2340 for TI validation",
)
