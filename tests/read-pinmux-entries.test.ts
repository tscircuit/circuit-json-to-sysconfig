import { expect, test } from "bun:test"
import { readPinmuxEntries } from "../scripts/read-pinmux-entries"

const source = `static Pinmux_PerCfg_t gPinMuxMainDomainCfg[] = {
  {PINMUX_END, PINMUX_END}
};
static Pinmux_PerCfg_t gPinMuxMcuDomainCfg[] = {
  /* MCU_GPIO0_5 -> MCU_SPI1_CS0 (A7) */
  { PIN_MCU_SPI1_CS0, ( PIN_MODE(7) | PIN_INPUT_ENABLE | PIN_PULL_DISABLE ) },
  {PINMUX_END, PINMUX_END}
};`

test("reads actual entries, ignores comments and terminators, and preserves domain/mode", () => {
  const unannotated = source.replace(/\/\*[\s\S]*?\*\//g, "")
  const expected: ReturnType<typeof readPinmuxEntries> = [
    { domain: "mcu", devicePin: "PIN_MCU_SPI1_CS0", muxMode: 7 },
  ]
  expect(readPinmuxEntries(source)).toEqual(expected)
  expect(readPinmuxEntries(unannotated)).toEqual(expected)
})

for (const invalidSource of [
  source.replace("PIN_INPUT_ENABLE", "UNKNOWN_SETTING"),
  source.replace("{PINMUX_END, PINMUX_END}", ""),
  source.replace("gPinMuxMainDomainCfg", "gUnknownPinmux"),
  source.replace("gPinMuxMainDomainCfg", "gPinMuxMcuDomainCfg"),
  source.replace("gPinMuxMainDomainCfg[]", "gPinMuxMainDomainCfg[1]"),
  source.replace(
    "{PINMUX_END, PINMUX_END}",
    "{PINMUX_END, PINMUX_END}, {PIN_UART0_RXD, (PIN_MODE(0))},",
  ),
]) {
  test("fails explicitly on initializer forms outside the pinned TI format", () => {
    expect(() => readPinmuxEntries(invalidSource)).toThrow(/Unrecognized/)
  })
}
