import { afterEach, beforeEach, expect, test } from "bun:test"
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const runnerPath = fileURLToPath(
  new URL("../scripts/validate-ti-reference.ts", import.meta.url),
)
const controlledCliPath = fileURLToPath(
  new URL("./fixtures/controlled-sysconfig-cli.ts", import.meta.url),
)
const nativePath = new URL(
  "./fixtures/ti-reference/reference.syscfg",
  import.meta.url,
)
let testDirectory: string
let environment: NodeJS.ProcessEnv

beforeEach(async () => {
  testDirectory = await mkdtemp(join(tmpdir(), "ti-runner-test-"))
  const sdkRoot = join(testDirectory, "SDK with spaces")
  for (const relativePath of [
    ".metadata/product.json",
    "source/drivers/.meta/gpio/gpio.syscfg.js",
    "source/drivers/.meta/pinmux/pinmux_am243x.syscfg.js",
  ]) {
    const filename = join(sdkRoot, relativePath)
    await mkdir(join(filename, ".."), { recursive: true })
    await writeFile(filename, "controlled test input")
  }
  environment = {
    ...process.env,
    TMPDIR: testDirectory,
    TI_SYSCONFIG_NODE: process.execPath,
    TI_SYSCONFIG_CLI: controlledCliPath,
    TI_SDK_ROOT: sdkRoot,
    TEST_TI_BEHAVIOR: "success",
  }
})

afterEach(async () => {
  await rm(testDirectory, { recursive: true, force: true })
})

async function runValidation() {
  const subprocess = Bun.spawn([process.execPath, runnerPath], {
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

for (const name of ["TI_SYSCONFIG_NODE", "TI_SYSCONFIG_CLI", "TI_SDK_ROOT"]) {
  test(`fails clearly when ${name} is missing`, async () => {
    delete environment[name]
    const result = await runValidation()
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(`Set ${name}`)
    expect(result.stdout).not.toContain("controlled CLI")
  })
}

for (const name of ["TI_SYSCONFIG_NODE", "TI_SYSCONFIG_CLI", "TI_SDK_ROOT"]) {
  test(`rejects nonexistent ${name} before spawning`, async () => {
    environment[name] = join(testDirectory, "missing")
    const result = await runValidation()
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("missing")
    expect(result.stdout).not.toContain("controlled CLI")
  })
}

test("rejects a non-executable runtime", async () => {
  const nodePath = join(testDirectory, "not-executable")
  await writeFile(nodePath, "not an executable")
  await chmod(nodePath, 0o600)
  environment.TI_SYSCONFIG_NODE = nodePath
  const result = await runValidation()
  expect(result.exitCode).toBe(1)
  expect(result.stdout).not.toContain("controlled CLI")
})

test("rejects an incomplete SDK before spawning", async () => {
  await rm(join(environment.TI_SDK_ROOT ?? "", "source"), { recursive: true })
  const result = await runValidation()
  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("gpio.syscfg.js")
  expect(result.stdout).not.toContain("controlled CLI")
})

for (const [behavior, diagnostic] of [
  ["nonzero", "exit 7"],
  ["missing", "ti_drivers_config.c"],
  ["empty", "empty file"],
  ["directory", "Expected a file"],
  ["wrong_pin", "GPIO_LED_PIN"],
  ["missing_solution", "Expected resolved"],
  ["changed_gpio", "configuration differs"],
  ["changed_pinmux", "configuration differs"],
  ["wrong_mode", "mux mode 7"],
  ["converted_failure", "exit 7"],
  ["converted_missing", "ti_drivers_config.c"],
  ["converted_wrong_pin", "GPIO_CONVERTED_PIN (6)"],
  ["converted_extra_pin", "no extra pin reservations"],
] as const) {
  test(`controlled subprocess: ${behavior} fails with a useful diagnostic`, async () => {
    environment.TEST_TI_BEHAVIOR = behavior
    const result = await runValidation()
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(diagnostic)
    expect(result.stdout).toContain("controlled CLI stdout")
    expect(result.stderr).toContain("controlled CLI stderr")
  })
}

test("controlled subprocess: uses fresh outputs, preserves inputs, and passes paths as arguments", async () => {
  const reference = await readFile(nativePath, "utf8")
  for (let runIndex = 0; runIndex < 2; runIndex++) {
    const result = await runValidation()
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("pinmux code is preserved")
    expect(result.stdout).toContain(
      "converted-A7: GPIO_CONVERTED resolves to MCU_GPIO0_5 / A7",
    )
    expect(result.stdout).toContain(
      "converted-B7: GPIO_CONVERTED resolves to MCU_GPIO0_6 / B7",
    )
  }
  const runDirectories = (await readdir(testDirectory)).filter((name) =>
    name.startsWith("circuit-json-to-sysconfig-"),
  )
  expect(runDirectories).toHaveLength(2)
  for (const runDirectory of runDirectories) {
    for (const variant of ["native", "round-trip"]) {
      const inputDirectory = join(testDirectory, runDirectory, variant)
      expect(
        await readFile(join(inputDirectory, "reference.syscfg"), "utf8"),
      ).toBe(reference)
      const invocation = JSON.parse(
        await readFile(
          join(inputDirectory, "generated/invocation.json"),
          "utf8",
        ),
      )
      expect(invocation.args).toEqual([
        "--product",
        join(environment.TI_SDK_ROOT ?? "", ".metadata/product.json"),
        "--context",
        "r5fss0-0",
        "--part",
        "ALV",
        "--package",
        "ALV",
        "--output",
        join(inputDirectory, "generated"),
        join(inputDirectory, "reference.syscfg"),
      ])
    }
  }
  for (const runDirectory of runDirectories) {
    for (const ball of ["A7", "B7"]) {
      const converted = await readFile(
        join(
          testDirectory,
          runDirectory,
          `converted-${ball}`,
          "converted.syscfg",
        ),
        "utf8",
      )
      expect(converted).toContain(`gpio1.MCU_GPIO.gpioPin.$assign = "${ball}"`)
      expect(converted).toContain('gpio1.$name = "GPIO_CONVERTED"')
      expect(converted).toContain("debug_log.enableUartLog = false")
    }
  }
  expect(await readFile(nativePath, "utf8")).toBe(reference)
  environment.TEST_TI_BEHAVIOR = "missing"
  expect((await runValidation()).exitCode).toBe(1)
})
