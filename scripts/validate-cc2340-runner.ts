import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { any_circuit_element } from "circuit-json"
import { parseSysConfig } from "sysconfigts"
import { loadPedometerCircuit } from "../examples/pedometer/load-circuit"
import { pedometerOptions } from "../examples/pedometer/options"
import { type Cc2340Options, convertCircuitJsonToSysConfig } from "../lib"

const requiredFiles = [
  "ti_drivers_config.c",
  "ti_drivers_config.h",
  "ti_devices_config.c",
] as const

function requirePath(environment: NodeJS.ProcessEnv, name: string) {
  const configuredPath = environment[name]
  if (!configuredPath?.trim()) throw new Error(`Set ${name}; see README.md.`)
  return resolve(configuredPath)
}

async function generate(
  inputPath: string,
  ctx: {
    nodePath: string
    cliPath: string
    productPath: string
    outputPath: string
    rtos?: "nortos"
  },
) {
  const subprocess = Bun.spawn(
    [
      ctx.nodePath,
      ctx.cliPath,
      "--product",
      ctx.productPath,
      "--device",
      "CC2340R5RGE",
      "--part",
      "Default",
      "--package",
      "RGE",
      ...(ctx.rtos ? ["--rtos", ctx.rtos] : []),
      "--output",
      ctx.outputPath,
      inputPath,
    ],
    { stdout: "inherit", stderr: "inherit" },
  )
  assert.equal(await subprocess.exited, 0, `TI rejected ${inputPath}`)
  for (const filename of requiredFiles) {
    assert.ok(
      (await readFile(join(ctx.outputPath, filename), "utf8")).trim(),
      filename,
    )
  }
}

function checkPedometer(drivers: string, header: string) {
  for (const [name, dio] of [
    ["CONFIG_DISPLAY_ISOLATE", 20],
    ["CONFIG_PMIC_LP", 3],
    ["CONFIG_ACCEL_INT", 12],
    ["CONFIG_GPIO_I2C_0_SDA", 8],
    ["CONFIG_GPIO_I2C_0_SCL", 6],
  ] as const) {
    assert.match(header, new RegExp(`^#define\\s+${name}\\s+${dio}\\s*$`, "m"))
  }
  assert.match(
    drivers,
    /GPIO_CFG_OUTPUT_INTERNAL \| GPIO_CFG_OUT_STR_MED \| GPIO_CFG_OUT_HIGH, \/\* CONFIG_DISPLAY_ISOLATE \*\//,
  )
  assert.match(
    drivers,
    /GPIO_CFG_OUTPUT_INTERNAL \| GPIO_CFG_OUT_STR_MED \| GPIO_CFG_OUT_LOW, \/\* CONFIG_PMIC_LP \*\//,
  )
  assert.match(
    drivers,
    /GPIO_CFG_INPUT_INTERNAL \| GPIO_CFG_IN_INT_NONE \| GPIO_CFG_PULL_NONE_INTERNAL, \/\* CONFIG_ACCEL_INT \*\//,
  )
  for (const dio of [4, 11, 13, 21, 24]) {
    assert.ok(drivers.includes(`GPIO_CFG_NO_DIR, /* DIO_${dio} */`))
  }
  for (const dio of [16, 17]) {
    assert.ok(drivers.includes(`GPIO_CFG_DO_NOT_CONFIG, /* DIO_${dio} */`))
  }
  assert.match(drivers, /\.baseAddr\s*= I2C0_BASE/)
  assert.match(drivers, /\.sclPin\s*= CONFIG_GPIO_I2C_0_SCL/)
  assert.match(drivers, /\.sdaPin\s*= CONFIG_GPIO_I2C_0_SDA/)
  assert.match(drivers, /\.sclPinMux\s*= GPIO_MUX_PORTCFG_PFUNC2/)
  assert.match(drivers, /\.sdaPinMux\s*= GPIO_MUX_PORTCFG_PFUNC4/)
  assert.match(header, /#define CONFIG_I2C_0_MAXSPEED\s+\(100U\)/)
  assert.match(
    header,
    /#define CONFIG_I2C_0_MAXBITRATE\s+\(\(I2C_BitRate\)I2C_100kHz\)/,
  )
  assert.doesNotMatch(header, /I2C_400kHz/)
  assert.match(drivers, /PowerLPF3_selectLFOSC\(\)/)
  assert.doesNotMatch(
    drivers,
    /PowerLPF3_selectLFXT|Board_\w*ExtFlash|BOARD_EXT_FLASH/,
  )
}

export async function validateCc2340(environment: NodeJS.ProcessEnv) {
  const ctx = {
    nodePath: requirePath(environment, "TI_SYSCONFIG_NODE"),
    cliPath: requirePath(environment, "TI_SYSCONFIG_CLI"),
    productPath: join(
      requirePath(environment, "TI_SDK_ROOT"),
      ".metadata/product.json",
    ),
  }
  const product = JSON.parse(await readFile(ctx.productPath, "utf8"))
  assert.equal(product.name, "simplelink_lowpower_f3_sdk")
  assert.equal(product.version, "9.21.00.36")
  const version = Bun.spawnSync([ctx.nodePath, ctx.cliPath, "--version"])
  assert.equal(version.exitCode, 0)
  assert.equal(version.stdout.toString().trim(), "1.28.1+4785")
  const directory = await mkdtemp(join(tmpdir(), "cc2340-ti-validation-"))
  const legacyCtx = { ...ctx, rtos: "nortos" as const }
  // Preserve inputs and outputs, including on failure, for independent review.
  console.log(`CC2340 evidence: ${directory}`)
  const inputPath = join(directory, "pedometer.syscfg")
  await writeFile(
    inputPath,
    convertCircuitJsonToSysConfig(
      await loadPedometerCircuit(),
      pedometerOptions,
    ).getString(),
  )
  const converted = join(directory, "converted")
  const reference = join(directory, "reference")
  await generate(inputPath, { ...legacyCtx, outputPath: converted })
  await generate(
    fileURLToPath(
      new URL(
        "../tests/fixtures/pedometer/v0.4.4-ccs-1.28.1.syscfg",
        import.meta.url,
      ),
    ),
    { ...legacyCtx, outputPath: reference },
  )
  checkPedometer(
    await readFile(join(converted, "ti_drivers_config.c"), "utf8"),
    await readFile(join(converted, "ti_drivers_config.h"), "utf8"),
  )
  for (const filename of requiredFiles) {
    assert.equal(
      await readFile(join(converted, filename), "utf8"),
      await readFile(join(reference, filename), "utf8"),
      `${filename}: CCS parity`,
    )
  }
  const options: Cc2340Options = {
    source_component_id: "source_component_0",
    gpios: [
      {
        source_port_id: "source_port_0",
        gpio_name: "CONFIG_SIGNAL",
        direction: "output",
        initial_state: "low",
      },
    ],
    reserved_ports: [],
    firmware: { rtos: "nortos", lf_clock_source: "lf_rcosc" },
  }
  for (const [physicalPin, dio] of [
    [5, 12],
    [6, 13],
  ] as const) {
    const circuit = any_circuit_element
      .array()
      .parse(
        await Bun.file(
          new URL(
            `../tests/fixtures/cc2340-pin-change/pin${physicalPin}.circuit.json.txt`,
            import.meta.url,
          ),
        ).json(),
      )
    const changedPath = join(directory, `pin${physicalPin}.syscfg`)
    await writeFile(
      changedPath,
      convertCircuitJsonToSysConfig(circuit, options).getString(),
    )
    const outputPath = join(directory, `pin${physicalPin}`)
    await generate(changedPath, { ...legacyCtx, outputPath })
    assert.match(
      await readFile(join(outputPath, "ti_drivers_config.h"), "utf8"),
      new RegExp(`^#define CONFIG_SIGNAL ${dio}$`, "m"),
    )
  }
  await validateDerivedCc2340({ ...ctx, directory })
  console.log(
    "CC2340 passed: legacy CCS parity and pin change; request-free GPIO/I2C, SDK defaults, round-trip C/header parity, and physical pin change.",
  )
}

async function validateDerivedCc2340(ctx: {
  nodePath: string
  cliPath: string
  productPath: string
  directory: string
}) {
  const circuit = any_circuit_element
    .array()
    .parse(
      await Bun.file(
        new URL(
          "../tests/fixtures/derived-cc2340/circuit.json",
          import.meta.url,
        ),
      ).json(),
    )
  const source = convertCircuitJsonToSysConfig(circuit).getString()
  assert.doesNotMatch(
    source,
    /initialOutputState|interruptTrigger|maxBitRate|srcClkLF|--rtos/,
  )
  const inputPath = join(ctx.directory, "derived.syscfg")
  await writeFile(inputPath, source)
  const outputPath = join(ctx.directory, "derived")
  await generate(inputPath, { ...ctx, outputPath })
  const drivers = await readFile(
    join(outputPath, "ti_drivers_config.c"),
    "utf8",
  )
  const header = await readFile(join(outputPath, "ti_drivers_config.h"), "utf8")
  for (const [name, dio] of [
    ["CONFIG_U1_PIN5", 12],
    ["CONFIG_U1_PIN6", 13],
    ["CONFIG_GPIO_U1_I2C0_SDA", 8],
    ["CONFIG_GPIO_U1_I2C0_SCL", 6],
  ] as const)
    assert.match(header, new RegExp(`^#define\\s+${name}\\s+${dio}\\s*$`, "m"))
  assert.match(
    drivers,
    /GPIO_CFG_OUTPUT_INTERNAL \| GPIO_CFG_OUT_STR_MED \| GPIO_CFG_OUT_LOW, \/\* CONFIG_U1_PIN5 \*\//,
  )
  assert.match(
    drivers,
    /GPIO_CFG_INPUT_INTERNAL \| GPIO_CFG_IN_INT_NONE \| GPIO_CFG_PULL_UP_INTERNAL, \/\* CONFIG_U1_PIN6 \*\//,
  )
  for (const dio of [16, 17])
    assert.ok(drivers.includes(`GPIO_CFG_DO_NOT_CONFIG, /* DIO_${dio} */`))
  assert.match(drivers, /\.baseAddr\s*= I2C0_BASE/)
  assert.match(drivers, /\.sclPinMux\s*= GPIO_MUX_PORTCFG_PFUNC2/)
  assert.match(drivers, /\.sdaPinMux\s*= GPIO_MUX_PORTCFG_PFUNC4/)
  assert.match(header, /#define CONFIG_U1_I2C0_MAXSPEED\s+\(100U\)/)
  assert.match(
    header,
    /#define CONFIG_U1_I2C0_MAXBITRATE\s+\(\(I2C_BitRate\)I2C_100kHz\)/,
  )
  assert.match(drivers, /PowerLPF3_selectLFXT\(\)/)
  assert.doesNotMatch(
    drivers,
    /PowerLPF3_selectLFOSC\(\)|Board_\w*ExtFlash|BOARD_EXT_FLASH/,
  )

  const roundTripPath = join(ctx.directory, "derived-round-trip.syscfg")
  await writeFile(roundTripPath, parseSysConfig(source).getString())
  const roundTripOutput = join(ctx.directory, "derived-round-trip")
  await generate(roundTripPath, { ...ctx, outputPath: roundTripOutput })
  for (const filename of requiredFiles)
    assert.equal(
      await readFile(join(outputPath, filename), "utf8"),
      await readFile(join(roundTripOutput, filename), "utf8"),
      `${filename}: derived round-trip parity`,
    )

  const output = circuit.find(
    (element) =>
      element.type === "source_port" && element.source_port_id === "output",
  )
  if (output?.type !== "source_port")
    throw new Error("Missing output fixture port")
  output.pin_number = 4
  const changedPath = join(ctx.directory, "derived-pin-change.syscfg")
  await writeFile(
    changedPath,
    convertCircuitJsonToSysConfig(circuit).getString(),
  )
  const changedOutput = join(ctx.directory, "derived-pin-change")
  await generate(changedPath, { ...ctx, outputPath: changedOutput })
  const changedHeader = await readFile(
    join(changedOutput, "ti_drivers_config.h"),
    "utf8",
  )
  assert.match(changedHeader, /^#define CONFIG_U1_PIN4 11$/m)
  assert.doesNotMatch(changedHeader, /^#define CONFIG_U1_PIN5 /m)
  assert.match(
    await readFile(join(changedOutput, "ti_drivers_config.c"), "utf8"),
    /GPIO_CFG_OUTPUT_INTERNAL \| GPIO_CFG_OUT_STR_MED \| GPIO_CFG_OUT_LOW, \/\* CONFIG_U1_PIN4 \*\//,
  )
  // SWD reset preservation is a native default, not an immutable reservation.
  output.pin_number = 7
  const debugPath = join(ctx.directory, "derived-debug-gpio.syscfg")
  await writeFile(debugPath, convertCircuitJsonToSysConfig(circuit).getString())
  const debugOutput = join(ctx.directory, "derived-debug-gpio")
  await generate(debugPath, { ...ctx, outputPath: debugOutput })
  assert.match(
    await readFile(join(debugOutput, "ti_drivers_config.h"), "utf8"),
    /^#define CONFIG_U1_PIN7 16$/m,
  )
  assert.match(
    await readFile(join(debugOutput, "ti_drivers_config.c"), "utf8"),
    /GPIO_CFG_OUTPUT_INTERNAL \| GPIO_CFG_OUT_STR_MED \| GPIO_CFG_OUT_LOW, \/\* CONFIG_U1_PIN7 \*\//,
  )
}
