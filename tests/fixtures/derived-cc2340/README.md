# Circuit JSON pin-attribute fixture

This is a hand-authored Circuit JSON 0.0.515 fixture, not a pedometer build or
firmware application preset. It declares output pin 5, input pin 6 with an
internal pull-up, and I2C SDA/SCL pins 3/19 using the existing pin attributes.
Physical identities use the converter's independently validated RGE target.
No startup level, interrupt, bitrate, LF clock or RTOS choice is declared.

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
  LF clock defaults to `LF XOSC`. The conversion rejects connected or configured
  pins 14/15 because Circuit JSON does not yet disambiguate their clock ownership.
- [GPIOLPF3.syscfg.js](https://github.com/TexasInstruments/simplelink-lowpower-f3-sdk/blob/lpf3-9.21.00.36_LTS/source/ti/drivers/.meta/gpio/GPIOLPF3.syscfg.js):
  unconfigured SWD pins retain their reset settings via `GPIO_CFG_DO_NOT_CONFIG`.
  This is a default, not a prohibition on explicitly selecting GPIO on these pins.

No RTOS option is passed in this test. Native peripheral generation succeeds
without selecting an application RTOS. These defaults do not establish the
correct startup, timing, interrupt or clock choices for an arbitrary application.
