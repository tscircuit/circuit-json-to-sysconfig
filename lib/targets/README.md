# AM2434BSDFHIALVR target provenance

This is one implementation target, not a user-approved demo-hardware selection.
The profile is a small transcription of documented identities and two GPIO
mappings, not a complete device database. No native `.syscfg` text is loaded or
copied by the converter. Real TI generation remains **NOT RUN**.

## Exact identity and pins

TI's [orderable-part page](https://www.ti.com/product/AM2434/part-details/AM2434BSDFHIALVR)
identifies `AM2434BSDFHIALVR` as AM2434 in the 441-ball ALV FCBGA package. The
[AM243x datasheet](https://www.ti.com/lit/ds/symlink/am2434.pdf), inspected as
**SPRSP65J, June 2026**, independently documents both selected ALV balls in
Table 5-1 (page 28) and Table 5-42 (page 72):

| ALV ball | Device pin | GPIO function | Mux mode |
| --- | --- | --- | --- |
| A7 | MCU_SPI1_CS0 | MCU_GPIO0_5 | 7 |
| B7 | MCU_SPI1_CS1 | MCU_GPIO0_6 | 7 |

Table 4-1 includes AM2434's R5F0_0 processor. Table 9-1 identifies revision B as
SR2.0 and the ALV package designator. The full MPN is matched exactly: no family,
package suffix, tray/reel, or alternate-marking inference is implemented.

## SysConfig and SDK identity

All SDK links below refer to revision
`e7e068494bbd5714d6d34c55b10184a5bd84ed30`, tag `REL.MCUSDK.08.06.00.34`.
Its [product manifest](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/.metadata/product.json)
provides device `AM243x_ALV_beta` and context `r5fss0-0`. The
[native example and makefile](https://github.com/TexasInstruments/mcupsdk-core/tree/e7e068494bbd5714d6d34c55b10184a5bd84ed30/examples/drivers/gpio/gpio_led_blink/am243x-evm/r5fss0-0_nortos)
select package/part `ALV`. This establishes the configuration target for the exact
ALV MPN above; it is not evidence of generation or firmware operation on that part.

The pinned manifest actually declares `MCU_PLUS_SDK@07.03.01`, despite the 08.06
source tag. The converter preserves that product identity in `@cliArgs`; the
validation runner explicitly supplies this checkout's `.metadata/product.json`.
It does not falsely relabel the manifest as 08.06. Required SysConfig is
**1.14.0+2667**, established by the SDK's `imports.mak` and
[08.06 release notes](https://software-dl.ti.com/mcu-plus-sdk/esd/AM243X/08_06_00_43/exports/docs/api_guide_am243x/RELEASE_NOTES_08_06_00_PAGE.html).
The actual SysConfig device database is a missing validation prerequisite.

## Minimal setup and generated-output checks

The SDK's [GPIO v0 module](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/source/drivers/.meta/gpio/v0/gpio_v0.syscfg.js)
loads `/system_common`; [AM243x system support](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/source/.meta/system_am243x.syscfg.js)
loads clock and debug-log infrastructure.
[Debug log](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/source/kernel/.meta/dpl/debug_log.syscfg.js)
creates a UART instance only when `enableUartLog` is true. The converter explicitly
sets it false and creates no UART or MPU instances. Remaining defaults come from
the SDK; this is not a bootable firmware configuration.

`useMcuDomainPeripherals`, `pinDir`, and fixed `MCU_GPIO` assignments follow the GPIO
module contract. The [GPIO SoC implementation](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/source/drivers/.meta/gpio/soc/gpio_am243x.syscfg.js)
uses TI's resolved solution to produce base/pin macros. The
[pinmux template](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/source/drivers/.meta/pinmux/pinmux_config.c.xdt)
emits each resolved ball annotation and register entry. The runner checks both,
including mux mode 7, and requires only one resolved pin in each converted file.
Expected A7/B7 results in the runner are independent of the converter lookup.

## Circuit JSON identity contract

The runtime uses `CircuitJson`, `SourcePort`, `source_port`, and `source_simple_chip`
from `circuit-json@0.0.506`. The inspected schema revision is
[`dc40ef8154ecc52773ab960da16faf76ce535b62`](https://github.com/tscircuit/circuit-json/tree/dc40ef8154ecc52773ab960da16faf76ce535b62/src/source).
`source_port.pin_number` is numeric; `name` and `port_hints` are strings. The
[core Port implementation](https://github.com/tscircuit/core/blob/e4c437f686004608f47a566fe5ced73fd26cec4f/lib/components/primitive-components/Port/Port.ts)
writes names/aliases (including numeric aliases) into `port_hints`. Consequently,
this converter requires an explicit exact ball alias instead of coercing or
interpreting an ordinal. Labels that look like other balls cause rejection;
matching known signal aliases corroborate a ball but cannot substitute for it.

## License and local verification

Only small target metadata and module/property identifiers are transcribed here;
no SDK source or generated C is vendored. The upstream MCU+ SDK component is
BSD-3-Clause per its [manifest](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/docs/manifest.html).
[LICENSE-TI.txt](LICENSE-TI.txt) carries its notice with the shipped target setup.

Local tests use Bun 1.3.9, TypeScript 5.9.3, Circuit JSON 0.0.506, and pinned
sysconfigts `21f9b7e6ad941d8925581ba0d7d084a575ee1454`. Converter, native-reference,
and controlled-runner tests pass. **Real TI generation, firmware compilation,
and hardware execution: NOT RUN.** See the root README for reproduction and the
missing installation prerequisites.
