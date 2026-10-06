# Circuit JSON pin-attribute fixture

This is a hand-authored Circuit JSON 0.0.515 fixture, not a pedometer build or
firmware application preset. It declares output pin 5, input pin 6 with an
internal pull-up, and I2C SDA/SCL pins 3/19 using the existing pin attributes.
Physical identities use the converter's independently validated RGE target.
No startup level, interrupt, bitrate, LF clock or RTOS choice is declared.
The source ports retain `is_bidirectional: true`, matching the GPIO capabilities
in TI's RGE pin table and the published CC2340R52E0RGER datasheet metadata.
This capability neither selects a GPIO direction nor claims SWD/crystal pins.

`bun run validate:cc2340` converts it without request options, runs TI SysConfig
1.28.1+4785 against official SimpleLink F3 SDK tag `lpf3-9.21.00.36_LTS`, and
checks the actual C/header output. It also runs the sysconfigts round trip and
a physical output-pin change, retaining all inputs and outputs.

The omitted values are resolved by the pinned SDK, not a board preset:

- [GPIO.syscfg.js](https://github.com/TexasInstruments/simplelink-lowpower-f3-sdk/blob/lpf3-9.21.00.36_LTS/source/ti/drivers/.meta/GPIO.syscfg.js):
  output startup `Low`, output type `Standard`, pull `None`, interrupt `None`.
- [I2C.syscfg.js](https://github.com/TexasInstruments/simplelink-lowpower-f3-sdk/blob/lpf3-9.21.00.36_LTS/source/ti/drivers/.meta/I2C.syscfg.js):
  `maxBitRate` defaults to `0`; without attached target instances it resolves to
  100 kbit/s. The converter writes no bitrate assignment.
- [CCFGCC23X0.syscfg.js](https://github.com/TexasInstruments/simplelink-lowpower-f3-sdk/blob/lpf3-9.21.00.36_LTS/source/ti/devices/.meta/CCFG/CCFGCC23X0.syscfg.js):
  LF clock defaults to `LF XOSC`. A recognized 32768 Hz two-pin crystal on MCU
  pins 14/15 explicitly selects that clock. Incomplete or conflicting ownership
  remains an error.
- [GPIOLPF3.syscfg.js](https://github.com/TexasInstruments/simplelink-lowpower-f3-sdk/blob/lpf3-9.21.00.36_LTS/source/ti/drivers/.meta/gpio/GPIOLPF3.syscfg.js):
  unconfigured SWD pins retain their reset settings via `GPIO_CFG_DO_NOT_CONFIG`.
  This is a default, not a prohibition on explicitly selecting GPIO on these pins.

No RTOS option is passed in this test. Native peripheral generation succeeds
without selecting an application RTOS. These defaults do not establish the
correct startup, timing, interrupt or clock choices for an arbitrary application.

`lf-crystal.circuit.json` is an independent source-only fixture with one GPIO
and a 32768 Hz crystal connected to MCU pins 14/15 through two named nets.
The generic net names deliberately carry no clock information. TI's
[CC23X0 Power initialization](https://github.com/TexasInstruments/simplelink-lowpower-f3-sdk/blob/lpf3-9.21.00.36_LTS/source/ti/drivers/.meta/power/PowerCC23X0.Board_init.c.xdt)
uses `CCFG.srcClkLF`; loading Power is required to emit the clock initialization
even when no I2C module is present. The native runner verifies `PowerLPF3_selectLFXT()`,
unallocated DIO3/DIO4, and C/header round-trip parity for this fixture.
The target's 32768 Hz constraint and RGE pin pair come from TI's
[CC2340 datasheet](https://www.ti.com/lit/ds/symlink/cc2340r5.pdf), LFXT specifications
and pin table. No pedometer signal names or firmware preset are part of this fixture.
