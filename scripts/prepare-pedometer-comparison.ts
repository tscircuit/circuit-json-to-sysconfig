import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { inspectSysConfig, parseSysConfig, SysConfigLiteral, type SysConfig } from "sysconfigts"
import { convertCircuitJsonToSysConfig } from "../lib/index"
import { loadPedometerCircuit } from "../examples/pedometer/load-circuit"
import { pedometerOptions } from "../examples/pedometer/options"

const outputDirectory = resolve(process.env.COMPARISON_OUTPUT ?? "generated/pedometer-comparison")
await mkdir(outputDirectory, { recursive: true })
const circuit = await loadPedometerCircuit()
const config = convertCircuitJsonToSysConfig(circuit, pedometerOptions)
const source = config.getString()
const reference = await readFile("tests/fixtures/pedometer/v0.4.4-reference.syscfg", "utf8")
const referenceConfig = parseSysConfig(reference)

function value(document: SysConfig, path: string) {
  const assignment = document.getAssignment(path)
  if (!assignment) return null
  if (!(assignment.value instanceof SysConfigLiteral)) throw new Error(`Expected explicit literal: ${path}`)
  return assignment.value.value
}

function settings(document: SysConfig) {
  const gpios = []
  const buses = []
  for (const instance of document.instances) {
    const module = document.modules.find((candidate) => candidate.name === instance.moduleName)
    const prefix = instance.name
    if (module?.modulePath === "/ti/drivers/GPIO") {
      gpios.push({
        name: value(document, `${prefix}.$name`),
        pin: value(document, `${prefix}.gpioPin.$assign`),
        mode: value(document, `${prefix}.mode`),
        initial_output_state: value(document, `${prefix}.initialOutputState`),
        output_type: value(document, `${prefix}.outputType`),
        pull: value(document, `${prefix}.pull`),
        interrupt: value(document, `${prefix}.interruptTrigger`),
      })
    } else if (module?.modulePath === "/ti/drivers/I2C") {
      buses.push({
        name: value(document, `${prefix}.$name`),
        sda: value(document, `${prefix}.i2c.sdaPin.$assign`),
        scl: value(document, `${prefix}.i2c.sclPin.$assign`),
        max_bit_rate_kbit_per_second: value(document, `${prefix}.maxBitRate`),
        fixed_peripheral: value(document, `${prefix}.i2c.$assign`),
        suggested_peripheral: value(document, `${prefix}.i2c.$suggestSolution`),
      })
    }
  }
  gpios.sort((a, b) => String(a.name).localeCompare(String(b.name)))
  buses.sort((a, b) => String(a.name).localeCompare(String(b.name)))
  return { gpios, i2c_buses: buses }
}

const expected = settings(referenceConfig)
const exported = settings(config)
const identical = JSON.stringify(expected) === JSON.stringify(exported)
const inputs = [
  ["reference.syscfg", reference],
  ["tscircuit-generated.syscfg", source],
  ["reference.roundtrip.syscfg", referenceConfig.getString()],
] as const
for (const [filename, content] of inputs) await writeFile(resolve(outputDirectory, filename), content)
await copyFile("tests/fixtures/pedometer/circuit.json.txt", resolve(outputDirectory, "pedometer-v0.4.4.circuit.json"))
await writeFile(resolve(outputDirectory, "converter-options.json"), JSON.stringify(pedometerOptions, null, 2) + "\n")
await writeFile(resolve(outputDirectory, "source-records.json"), JSON.stringify(circuit, null, 2) + "\n")
await writeFile(resolve(outputDirectory, "reference-inspection.json"), JSON.stringify(inspectSysConfig(referenceConfig), null, 2) + "\n")
await writeFile(resolve(outputDirectory, "tscircuit-inspection.json"), JSON.stringify(inspectSysConfig(config), null, 2) + "\n")
const report = {
  converter_revision: "007eb0475681b0088efa19e845b3807ab1b1ec27",
  execution_revision: process.env.GITHUB_SHA ?? "local",
  device: "CC2340R52E0RGER",
  board: "seveibar/pedometer v0.4.4",
  scope: "Three explicit GPIOs and one I2C bus; NoRTOS. Not complete display/BLE firmware.",
  reference_provenance: "Independently authored v0.4.4 candidate from the converter repository. Not a native TI-generated result.",
  source_setting_comparison: identical ? "MATCH" : "MISMATCH",
  round_trip_exact: referenceConfig.getString() === reference,
  ti_cli_status: "NOT_RUN",
  ti_cli_reason: "This preparation job does not install or execute TI. Separate installation-license approval was previously recorded as pending.",
  reference_settings: expected,
  converter_settings: exported,
  hashes: Object.fromEntries(inputs.map(([filename, content]) => [filename, createHash("sha256").update(content).digest("hex")])),
}
await writeFile(resolve(outputDirectory, "comparison.json"), JSON.stringify(report, null, 2) + "\n")
await writeFile(resolve(outputDirectory, "README.md"), `# Pedometer v0.4.4 comparison preparation\n\nThe real, unchanged converter at 007eb047 was executed on its frozen pedometer Circuit JSON.\n\n- reference.syscfg: independently authored version-matched candidate; NOT TI output.\n- tscircuit-generated.syscfg: actual converter output.\n- comparison.json: explicit source-setting comparison only; not evaluated TI settings.\n- reference.roundtrip.syscfg: parser round-trip of the reference.\n- pedometer-v0.4.4.circuit.json: full original archived circuit input.\n- source-records.json: the source-record projection consumed by the existing example.\n- converter-options.json: explicit application choices.\n\nTI CLI has NOT RUN. This directory contains no TI-generated C or header files.\nThe existing AM2434 CI result is not a CC2340 result.\n\nAfter license approval and installation, run both .syscfg files through the same SysConfig 1.26.3+4558 and SimpleLink F3 SDK 9.21.00.36, then compare actual generated pins, electrical settings, and CONFIG_I2C_0_MAXBITRATE = I2C_100kHz.\n`)
console.log(JSON.stringify(report, null, 2))
console.log(`CONVERTER_OUTPUT_BEGIN\n${source}\nCONVERTER_OUTPUT_END`)
if (!identical) throw new Error("Explicit source settings differ from the independent candidate")
