// Controlled subprocess for runner tests only. This does not implement TI validation.
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const behavior = process.env.TEST_TI_BEHAVIOR
const outputDirectory = process.argv[process.argv.indexOf("--output") + 1]
if (!outputDirectory) throw new Error("Missing --output")
const isConverted = outputDirectory.includes("converted-")
const isChangedPin = outputDirectory.includes("converted-B7")
const isRoundTrip = outputDirectory.includes("round-trip")
console.log("controlled CLI stdout")
console.error("controlled CLI stderr")
if (behavior === "nonzero" || (behavior === "converted_failure" && isConverted))
  process.exit(7)
if (
  behavior === "missing" ||
  (behavior === "converted_missing" && isChangedPin)
)
  process.exit(0)
mkdirSync(outputDirectory, { recursive: true })
const gpio_name = isConverted ? "GPIO_CONVERTED" : "GPIO_LED"
const ball = isChangedPin ? "B7" : "A7"
const pinIndex = behavior === "wrong_pin" ? 6 : isChangedPin ? 6 : 5
const generatedPinIndex =
  behavior === "converted_wrong_pin" && isChangedPin ? 5 : pinIndex
const devicePin = isChangedPin ? "MCU_SPI1_CS1" : "MCU_SPI1_CS0"
const pinMode = behavior === "wrong_mode" ? 6 : 7
const pull =
  behavior === "changed_pinmux" && isRoundTrip ? " | PIN_PULL_DISABLE" : ""
const trigger =
  behavior === "changed_gpio" && isRoundTrip ? "RISE_EDGE" : "NONE"
const extraPin =
  behavior === "converted_extra_pin" && isConverted
    ? "/* USART0_RXD -> UART0_RXD (D15) */ { PIN_UART0_RXD, ( PIN_MODE(0) ) },"
    : ""
const unannotatedPin =
  behavior === "converted_unannotated_extra" && isConverted
    ? "{ PIN_UART0_RXD, ( PIN_MODE(0) ) },"
    : behavior === "converted_duplicate" && isConverted
      ? `{ PIN_${devicePin}, ( PIN_MODE(7) ) },`
      : behavior === "converted_unknown_initializer" && isConverted
        ? "{ .offset = PIN_UART0_RXD, .settings = PIN_MODE(0) },"
        : ""
const pinmux = `static Pinmux_PerCfg_t gPinMuxMainDomainCfg[] = {
  ${behavior === "converted_extra_main" && isConverted ? "{ PIN_UART0_TXD, ( PIN_MODE(0) ) }," : ""}
  { PINMUX_END, PINMUX_END }
};
static Pinmux_PerCfg_t gPinMuxMcuDomainCfg[] = {
  /* MCU_GPIO0_${generatedPinIndex} -> ${devicePin} (${ball}) */
  { PIN_${devicePin}, ( PIN_MODE(${pinMode})${pull} ) },
  ${extraPin}
  ${unannotatedPin}
  { PINMUX_END, PINMUX_END }
};`
const header = `#define ${gpio_name}_BASE_ADDR (CSL_MCU_GPIO0_BASE)
#define ${gpio_name}_PIN (${generatedPinIndex})
#define ${gpio_name}_DIR (GPIO_DIRECTION_OUTPUT)
#define ${gpio_name}_TRIG_TYPE (GPIO_TRIG_TYPE_${trigger})
`
for (const [filename, source] of [
  ["ti_drivers_config.c", "void GPIO_init(void) {}"],
  ["ti_drivers_config.h", header],
  [
    "ti_pinmux_config.c",
    behavior === "missing_solution" ? "void Pinmux_init(void) {}" : pinmux,
  ],
] as const) {
  const generatedPath = join(outputDirectory, filename)
  if (behavior === "directory") mkdirSync(generatedPath)
  else writeFileSync(generatedPath, behavior === "empty" ? "" : source)
}
writeFileSync(
  join(outputDirectory, "invocation.json"),
  JSON.stringify({ args: process.argv.slice(2) }),
)
