# Provisional TI GPIO reference

`reference.syscfg` is an unchanged copy of TI's
[GPIO LED blink example](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/examples/drivers/gpio/gpio_led_blink/am243x-evm/r5fss0-0_nortos/example.syscfg).
It is a validation input, **not an approved demo target**. The fixture itself does not identify an orderable manufacturer part number;
`AM243x_ALV_beta` is a SysConfig device identifier, not an MPN. The converter's
separately verified, narrowly supported MPN is documented in
[the target profile](../../../lib/targets/README.md).

| Item | Recorded source identity |
| --- | --- |
| Repository revision | `e7e068494bbd5714d6d34c55b10184a5bd84ed30` |
| SDK source tag | `REL.MCUSDK.08.06.00.34` |
| Device | `AM243x_ALV_beta` |
| Package / SysConfig part | `ALV` / `ALV` (not an orderable part number) |
| Core / OS | `r5fss0-0` / no RTOS |
| Example board | `am243x-evm`; no `--board` selection in the file or makefile |
| Product ID in source metadata and native header | `MCU_PLUS_SDK@07.03.01` |
| Native file's creation tool | `1.8.1+1900` (header also records data/timestamp `2021040816`) |
| Release's required tool | SysConfig `1.14.0`, build `2667` |
| Local real-TI validation | **NOT RUN**; missing runtime, device database, and complete SDK |

The historical header is preserved verbatim. It is not a claim that SDK 07.03.01
or SysConfig 1.8.1 was used for this PR. The selected source release's
[`imports.mak`](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/imports.mak) selects SysConfig 1.14.0;
[TI's 08.06 release notes](https://software-dl.ti.com/mcu-plus-sdk/esd/AM243X/08_06_00_43/exports/docs/api_guide_am243x/RELEASE_NOTES_08_06_00_PAGE.html)
identify build 2667. The runner's arguments come from this revision's
[example makefile](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/examples/drivers/gpio/gpio_led_blink/am243x-evm/r5fss0-0_nortos/ti-arm-clang/makefile),
including the explicit product-file override. Use the pinned source checkout in
the [root instructions](../../../README.md), not an unrecorded SDK upgrade.

SHA-256 of the native file:
`8c4e299f85cc2678def58b5813631cc6a094c46dd41ea62b242dce68b2d8f11e`.

## Configuration support inspected

- [`.metadata/product.json`](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/.metadata/product.json) declares product
  identity, module search roots, supported devices/contexts, and minimum tool
  version 1.14.0. It does **not** contain the pin database.
- [`gpio.syscfg.js`](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/source/drivers/.meta/gpio/gpio.syscfg.js) selects the
  SoC's GPIO driver version. The
  [`v0 module`](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/source/drivers/.meta/gpio/v0/gpio_v0.syscfg.js) defines
  direction and pinmux requirements. Its
  [AM243x support](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/source/drivers/.meta/gpio/soc/gpio_am243x.syscfg.js)
  derives peripheral and GPIO number from TI's resolved `$solution`.
- [`pinmux_am243x.syscfg.js`](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/source/drivers/.meta/pinmux/pinmux_am243x.syscfg.js)
  reads `system.deviceData.devicePins`, peripheral interfaces, mux settings, and
  electrical defaults. It emits the resolved peripheral/device/ball comment and
  pinmux register settings. The SysConfig-supplied device database itself was
  unavailable for local inspection or execution; a product manifest cannot
  substitute for it.
- The [GPIO header template](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/source/drivers/.meta/gpio/templates/gpio.h.xdt)
  emits the base-address, pin, direction, and trigger macros checked by the runner.
  The [pinmux template](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/source/drivers/.meta/pinmux/pinmux_config.c.xdt)
  emits the main/MCU pinmux arrays. Expected output filenames come from the
  example makefile.

The source fixes `gpio1.MCU_GPIO` to `MCU_GPIO0`, pin to `A7`, and direction to
`OUTPUT`; its instance name is `GPIO_LED`. TI's
[AM243x datasheet, pin attributes table](https://www.ti.com/lit/ds/sprsp65g/sprsp65g.pdf)
identifies A7 as `MCU_SPI1_CS0`, with `MCU_GPIO0_5` in mux mode 7. The runner checks
that resolved mapping, GPIO pin 5, output direction, and unchanged generated
pinmux code. This is a reference-specific check, not a general device mapper.
UART console setup (`USART0`, suggested RX D15 / TX C16) and six MPU regions
remain intact; they are required context from this native example, not converter
output. No claim about an orderable MPN follows from these identifiers.

## License

The upstream [software manifest](https://github.com/TexasInstruments/mcupsdk-core/blob/e7e068494bbd5714d6d34c55b10184a5bd84ed30/docs/manifest.html) assigns the MCU+ SDK
source/examples component BSD-3-Clause. `LICENSE-TI.txt` retains its copyright,
conditions, and disclaimer verbatim. The fixture was copied without changes;
keep this notice alongside it when redistributing. No SDK or generated output is
vendored here.
