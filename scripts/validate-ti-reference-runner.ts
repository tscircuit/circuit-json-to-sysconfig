import { constants } from "node:fs"
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { parseSysConfig } from "sysconfigts"
import { createGpioValidationCases } from "./create-gpio-validation-cases"

const referencePath = new URL(
  "../tests/fixtures/ti-reference/reference.syscfg",
  import.meta.url,
)
const generatedFilenames = [
  "ti_drivers_config.c",
  "ti_drivers_config.h",
  "ti_pinmux_config.c",
] as const

function requireEnvironmentPath(environment: NodeJS.ProcessEnv, name: string) {
  const configuredPath = environment[name]
  if (!configuredPath?.trim()) {
    throw new Error(
      `Set ${name}; see README.md for the required TI installation.`,
    )
  }
  return resolve(configuredPath)
}

async function requireFile(filename: string, executable = false) {
  if (!(await stat(filename)).isFile()) {
    throw new Error(`Expected a file: ${filename}`)
  }
  await access(
    filename,
    executable ? constants.R_OK | constants.X_OK : constants.R_OK,
  )
}

async function generateSysConfig(options: {
  nodePath: string
  cliPath: string
  productPath: string
  inputPath: string
  outputDirectory: string
}) {
  await mkdir(options.outputDirectory)
  const subprocess = Bun.spawn(
    [
      options.nodePath,
      options.cliPath,
      "--product",
      options.productPath,
      "--context",
      "r5fss0-0",
      "--part",
      "ALV",
      "--package",
      "ALV",
      "--output",
      options.outputDirectory,
      options.inputPath,
    ],
    { stdout: "inherit", stderr: "inherit" },
  )
  const exitCode = await subprocess.exited
  if (exitCode !== 0) {
    throw new Error(
      `TI generation failed (exit ${exitCode}): ${options.inputPath}`,
    )
  }
  for (const filename of generatedFilenames) {
    const generatedPath = join(options.outputDirectory, filename)
    await requireFile(generatedPath)
    if (!(await readFile(generatedPath, "utf8")).trim()) {
      throw new Error(`TI generated an empty file: ${generatedPath}`)
    }
  }
}

async function readResolvedGpio(
  outputDirectory: string,
  expected: {
    gpio_name: string
    peripheral: string
    pin: number
    devicePin: string
    ball: string
  },
) {
  const driversHeader = await readFile(
    join(outputDirectory, "ti_drivers_config.h"),
    "utf8",
  )
  const pinmux = await readFile(
    join(outputDirectory, "ti_pinmux_config.c"),
    "utf8",
  )
  for (const [macro, expression] of [
    ["BASE_ADDR", `CSL_${expected.peripheral}_BASE`],
    ["PIN", String(expected.pin)],
    ["DIR", "GPIO_DIRECTION_OUTPUT"],
  ]) {
    const assignment = new RegExp(
      `^#define\\s+${expected.gpio_name}_${macro}\\s+\\(\\s*${expression}\\s*\\)\\s*$`,
      "m",
    )
    if (!assignment.test(driversHeader)) {
      throw new Error(
        `Expected ${expected.gpio_name}_${macro} (${expression}) in ${outputDirectory}`,
      )
    }
  }
  // Check TI's resolved annotation together with the actual mux register entry.
  const resolvedPin = new RegExp(
    String.raw`/\*\s*${expected.peripheral}_${expected.pin}\s*->\s*${expected.devicePin}\s*\(${expected.ball}\)\s*\*/\s*\{\s*PIN_${expected.devicePin},\s*\(\s*PIN_MODE\(7\)`,
  )
  if (!resolvedPin.test(pinmux)) {
    throw new Error(
      `Expected resolved ${expected.peripheral}_${expected.pin} on ${expected.devicePin} (${expected.ball}), mux mode 7 in ${outputDirectory}`,
    )
  }
  return {
    gpioMacros: driversHeader
      .match(new RegExp(String.raw`^#define\s+${expected.gpio_name}_.*$`, "gm"))
      ?.join("\n"),
    resolvedPinCount: [
      ...pinmux.matchAll(/\/\*\s*\w+\s*->\s*\w+\s*\([A-Z]+\d+\)\s*\*\//g),
    ].length,
    // Ignore generated comments (which may contain paths); compare all pinmux code.
    pinmuxCode: pinmux
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\s+/g, " ")
      .trim(),
  }
}

export async function validateTiReference(environment: NodeJS.ProcessEnv) {
  const nodePath = requireEnvironmentPath(environment, "TI_SYSCONFIG_NODE")
  const cliPath = requireEnvironmentPath(environment, "TI_SYSCONFIG_CLI")
  const sdkRoot = requireEnvironmentPath(environment, "TI_SDK_ROOT")
  const productPath = join(sdkRoot, ".metadata/product.json")
  await requireFile(nodePath, true)
  for (const filename of [
    cliPath,
    productPath,
    join(sdkRoot, "source/drivers/.meta/gpio/gpio.syscfg.js"),
    join(sdkRoot, "source/drivers/.meta/pinmux/pinmux_am243x.syscfg.js"),
  ]) {
    await requireFile(filename)
  }
  const reference = await readFile(referencePath, "utf8")
  const roundTripped = parseSysConfig(reference).getString()
  if (roundTripped !== reference)
    throw new Error("sysconfigts changed the native reference")

  const runDirectory = await mkdtemp(
    join(tmpdir(), "circuit-json-to-sysconfig-"),
  )
  console.log(`TI validation output: ${runDirectory}`)
  console.log(
    `TI runtime: ${nodePath}\nTI CLI: ${cliPath}\nTI product: ${productPath}`,
  )
  const nativeOutput = join(runDirectory, "native/generated")
  const roundTripOutput = join(runDirectory, "round-trip/generated")
  for (const [variant, source] of [
    ["native", reference],
    ["round-trip", roundTripped],
  ] as const) {
    const inputDirectory = join(runDirectory, variant)
    await mkdir(inputDirectory)
    const inputPath = join(inputDirectory, "reference.syscfg")
    await writeFile(inputPath, source)
    await generateSysConfig({
      nodePath,
      cliPath,
      productPath,
      inputPath,
      outputDirectory: join(inputDirectory, "generated"),
    })
  }
  const nativeExpected = {
    gpio_name: "GPIO_LED",
    peripheral: "MCU_GPIO0",
    pin: 5,
    devicePin: "MCU_SPI1_CS0",
    ball: "A7",
  }
  const nativeGpio = await readResolvedGpio(nativeOutput, nativeExpected)
  const roundTripGpio = await readResolvedGpio(roundTripOutput, nativeExpected)
  if (
    nativeGpio.gpioMacros !== roundTripGpio.gpioMacros ||
    nativeGpio.pinmuxCode !== roundTripGpio.pinmuxCode
  ) {
    throw new Error(
      "Native and round-tripped GPIO/pinmux configuration differs",
    )
  }
  console.log(
    "TI generation passed for both copies; GPIO_LED resolves to MCU_GPIO0_5 / A7 and pinmux code is preserved.",
  )
  for (const { variant, source, expected } of createGpioValidationCases()) {
    const inputDirectory = join(runDirectory, variant)
    await mkdir(inputDirectory)
    const inputPath = join(inputDirectory, "converted.syscfg")
    await writeFile(inputPath, source)
    const outputDirectory = join(inputDirectory, "generated")
    await generateSysConfig({
      nodePath,
      cliPath,
      productPath,
      inputPath,
      outputDirectory,
    })
    const resolvedGpio = await readResolvedGpio(outputDirectory, expected)
    if (resolvedGpio.resolvedPinCount !== 1) {
      throw new Error(
        `Expected exactly one resolved GPIO pin and no extra pin reservations in ${variant}`,
      )
    }
    console.log(
      `TI generation passed for ${variant}: ${expected.gpio_name} resolves to ${expected.peripheral}_${expected.pin} / ${expected.ball}`,
    )
  }
}
