// Controlled subprocess for runner tests only. This does not implement TI validation.
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const behavior = process.env.TEST_TI_BEHAVIOR
const outputDirectory = process.argv[process.argv.indexOf("--output") + 1]
if (!outputDirectory) throw new Error("Missing --output")
console.log("controlled CLI stdout")
console.error("controlled CLI stderr")
if (behavior === "nonzero") process.exit(7)
if (behavior === "missing") process.exit(0)
mkdirSync(outputDirectory, { recursive: true })
const isRoundTrip = outputDirectory.includes("round-trip")
const pinIndex = behavior === "wrong_pin" ? 6 : 5
const pinMode = behavior === "changed_pinmux" && isRoundTrip ? 6 : 7
const trigger =
  behavior === "changed_gpio" && isRoundTrip ? "RISE_EDGE" : "NONE"
const pinmux = `/* MCU_GPIO0_5 -> MCU_SPI1_CS0 (A7) */
static Pinmux_PerCfg_t gPinMuxMcuDomainCfg[] = {
  { PIN_MCU_SPI1_CS0, ( PIN_MODE(${pinMode}) ) },
  { PINMUX_END, PINMUX_END }
};`
const header = `#define GPIO_LED_BASE_ADDR (CSL_MCU_GPIO0_BASE)
#define GPIO_LED_PIN (${pinIndex})
#define GPIO_LED_DIR (GPIO_DIRECTION_OUTPUT)
#define GPIO_LED_TRIG_TYPE (GPIO_TRIG_TYPE_${trigger})
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
  JSON.stringify({
    args: process.argv.slice(2),
  }),
)
