# Pedometer v0.4.4 provenance and scope

Status: source build, library tests, **real CC2340 TI generation and CCS GUI
validation pass** with SysConfig 1.28.1+4785 / SimpleLink F3 SDK 9.21.00.36.
The generated driver/device C files compile individually with TI ARM Clang
5.1.1.LTS for Cortex-M0+. No complete firmware link or hardware test was performed.

## Frozen input

Source: [seveibar/pedometer](https://tscircuit.com/seveibar/pedometer#files), version
**0.4.4**, registry release `40826b3e-73c8-4a4e-b55e-5a18be3cf938`.
The registry reports no GitHub source repository or commit for this release.
`source-v0.4.4.tar.gz` freezes the entrypoint, all imported component definitions,
and original package manifest/lockfile. `source-sha256.json` records each file's
content hash. These are original board sources, not a new compiler or library dependency.

- `index.circuit.tsx`: `846850d542704dbc4b90f3a5a6408225001163d77a71835662039b28a7e9702d`
- `imports/CC2340R52E0RGER.tsx`: `e39097a7cd16f26aabeaab84e5f0afcb334f66c153db296272effb5793489060`
- Original generated Circuit JSON: `3b28a9019b563bf05aca27cb6d14229b99ab670beeb6243a9e3d16500873205d`

`circuit.json.txt` preserves the complete generated JSON byte-for-byte; the `.txt`
suffix prevents a formatter from rewriting this evidence. No generated pin or
connectivity record was hand-edited. The example loads source records using the
existing Circuit JSON schemas; it does not consume schematic/PCB geometry.
The pinned Circuit JSON schema rejects unrelated schematic groups with null
`subcircuit_id`, so the example deliberately validates the source-record projection.
The full original file remains available for inspection and its hash is tested.

Reproduction (Bun **1.3.9**, published **tscircuit 0.0.2463**):

```sh
mkdir /tmp/pedometer-v0.4.4
tar -xzf tests/fixtures/pedometer/source-v0.4.4.tar.gz -C /tmp/pedometer-v0.4.4
cd /tmp/pedometer-v0.4.4
bun install --frozen-lockfile
bun node_modules/tscircuit/cli.mjs build index.circuit.tsx --disable-pcb
# Output: dist/index/circuit.json
```

The build exited 0. This uses the compiler's documented PCB-disable mode because
conversion needs source connectivity, not routing. Do not use `--ignore-errors`.
Supplier metadata lookups require network access; warning IDs and project metadata
can vary across builds. Verify source hashes and MCU connectivity separately from
the archived output hash. `tsci clone` upgrades package dependencies during setup;
restore the published package.json and lockfile before reproducing this release.
Rebuilding the archived sources with network access succeeded; every circuit
record matched the frozen build except `source_project_metadata`'s filesystem hash.

## MCU and assignments

The selected `source_component_25` (`U1_MCU`) has full orderable MPN
**CC2340R52E0RGER**, RGE 24-pin VQFN with exposed pad 25.
Sources: [TI orderable part](https://www.ti.com/product/CC2340R5/part-details/CC2340R52E0RGER),
[TI SWRS272F datasheet, RGE pin table](https://www.ti.com/lit/ds/symlink/cc2340r5.pdf),
and the frozen component pin labels and source traces.
The SysConfig device identifier `CC2340R5RGE` is not the full orderable MPN.

| Source port | Physical pin | TI identifier | v0.4.4 signal | Explicit example request |
| --- | --- | --- | --- | --- |
| source_port_103 | 9 | DIO20_A11 | DISP_PWR_N | CONFIG_DISPLAY_ISOLATE: output, initially High |
| source_port_108 | 14 | DIO3_X32P | CHG_LP | CONFIG_PMIC_LP: output, initially Low |
| source_port_99 | 5 | DIO12 | ACCEL_INT1 | CONFIG_ACCEL_INT: input, no pull, no interrupt |
| source_port_97 | 3 | DIO8 | I2C_SDA | CONFIG_I2C_0 SDA, 100000 bit/s |
| source_port_113 | 19 | DIO6_A1_AR+ | I2C_SCL | CONFIG_I2C_0 SCL, same bus |

The source alias `DIO6_A1` maps to the exact SysConfig identifier `DIO6_A1_AR+`.
`DIO24_A7` is a DIO identifier, not BGA ball A7. Numeric package pins drive
resolution; any numeric/DIO aliases must agree. The source does not declare
active pin functions, so firmware behavior is supplied explicitly in the example.
Output GPIOs use standard push-pull, no pull, and no interrupt. Input pull and
interrupt settings are mandatory. The `_INT` suffix never selects an interrupt.
Declared internal pull-up/pull-down flags are accepted when they agree with the
input request, and declared push-pull is accepted for standard GPIO output.
Conflicting declarations and unsupported open-drain GPIO requests are rejected.
I2C electrical-mode declarations remain unsupported pending TI verification.
I2C0 is suggested in this example; callers can explicitly request a fixed assignment.
Only the pin-3 SDA / pin-19 SCL route and 100000-bit/s setting are in this initial scope.
The public `max_bit_rate` is in **bits/s**. The SDK's `maxBitRate` property is in
**kbit/s**, so the exporter writes `100` for a `100000` request. The pinned
[I2C metadata](https://github.com/TexasInstruments/simplelink-lowpower-f3-sdk/blob/c55fa9bae0ec71b103508afac4861d446204669b/source/ti/drivers/.meta/I2C.syscfg.js)
and [header template](https://github.com/TexasInstruments/simplelink-lowpower-f3-sdk/blob/c55fa9bae0ec71b103508afac4861d446204669b/source/ti/drivers/.meta/i2c/I2C.Board.h.xdt)
establish the units and rate-enum selection; this source inspection is not a TI execution result.

## Conflicts with the supplied reference

| Physical pin | Actual v0.4.4 signal | Supplied reference setting | Disposition |
| --- | --- | --- | --- |
| 4 / DIO11 | DISP_CS | CONFIG_PMIC_LP output | Reserve display CS; real CHG_LP is pin 14 / DIO3_X32P |
| 6 / DIO13 | DISP_MOSI | CONFIG_PMIC_INT | Reserve display data; no PMIC interrupt request |
| 10 / DIO21_A10 | DISP_DC | CONFIG_GAUGE_INT | Reserve display D/C; no gauge interrupt request |
| 12 / DIO24_A7 | DISP_SCLK | CONFIG_BUTTON, falling edge | Reserve display clock; no MCU button request |

The wake switch connects to charger MR; gauge GPOUT is not connected to an MCU
port in this source. They must not be invented as MCU GPIOs. Display reset on pin
15 and SWD pins 7/8 are also reserved. Reservations are explicit caller-owned
source-port declarations; they prevent overlap with generated requests and emit
no TI driver allocation. They do not implement those peripherals.

The single included display GPIO controls the power-isolation FET. Its initially
High level is an explicit example firmware choice matching that control role,
not an inferred SPI configuration. Display D/C/reset behavior is not established
here; those controls and SPI conversion remain unsupported. No complete display
or pedometer firmware application is provided. Unsupported option fields and
active incompatible port functions throw instead of being silently discarded.

## Independent references and firmware

`unmatched-reference.syscfg` is unchanged from
[sysconfigts 35381191fb3946185632d9c4c2ac4c2e69329535](https://github.com/tscircuit/sysconfigts/blob/35381191fb3946185632d9c4c2ac4c2e69329535/tests/fixtures/pedometer/pedometer.syscfg).
SHA-256: `d369b83da1501103629432624e6136fbdc12e3cd30808d22e604c5b4e1f51e7c`.
It is an **unmatched historical/parser fixture**, transcribed from development
notes, and is not a verified configuration for v0.4.4. Round-trip parsing is
byte-identical. Neither the converter nor its expected board mapping uses it.
Its `I2C1.maxBitRate = 100000` also has incorrect units for a 100-kbit/s bus:
TI interprets that literal as kbit/s. The pinned SDK template selects the highest
supported rate below that value, producing the incorrect 400-kHz selection.
This historical error is intentionally preserved; only the v0.4.4 candidate and
converter output use the corrected numeric value `100`.

`v0.4.4-reference.syscfg` is a separately authored GPIO/I2C candidate based on
the source traces, physical pin table, and explicit choices above. It remains
unchanged as the original candidate. Real TI inspection exposed two missing
settings: the default external LF crystal conflicts with the board's DIO3/DIO4
use, and default LaunchPad flash startup drives display pins 11/24/13/21.

`v0.4.4-ccs-1.28.1.syscfg` was produced by opening a copy of that candidate in CCS
21.0.1, selecting **LF RCOSC**, disabling Board **Generate Initialization
Functions**, and saving through the SysConfig GUI. The GUI reported no problems.
It preserves TI's saved source, including its tool version. The converter's
`ti_drivers_config.c`, `ti_drivers_config.h`, and `ti_devices_config.c` match the
reference's real TI output byte-for-byte. The CLI-built original TSX also produces
the same three files. Generated output was not manually patched.

The example explicitly selects
`firmware: { rtos: "nortos", lf_clock_source: "lf_rcosc" }`. No BLE, FreeRTOS,
NVS, radio, AES, or DMA application settings are copied. The historical settings
remain in their parser fixture. An application preset is deferred until its
compatibility and resource reservations can be checked with the matching TI
environment; requests for one are rejected. This avoids presenting unchecked
application settings as universal CC2340 defaults.

## Real TI validation

Validated environment: **SysConfig 1.28.1+4785**, **CCS 21.0.1**, and
**SimpleLink F3 SDK 9.21.00.36** on macOS arm64, using the installed CCS tools.
The official SDK tag `lpf3-9.21.00.36_LTS` resolves to
`c55fa9bae0ec71b103508afac4861d446204669b`; its metadata declares minimum tool
version 1.26.3 and includes `nortos`. SDK GPIO metadata declares Input, Low,
None pull, and None interrupt defaults, but this example writes its relevant
settings explicitly.

Run `bun run validate:cc2340` with the three TI environment variables documented
in the root README. It checks the generated GPIO electrical settings, exact
I2C pin/mux assignments, reserved display/debug pins, and internal LF clock.
`CONFIG_I2C_0_MAXSPEED` must be `100U` and `CONFIG_I2C_0_MAXBITRATE` must select
`I2C_100kHz`, not `I2C_400kHz`. It rejects LaunchPad flash routines and compares
all three generated C/header files to the CCS-saved reference, then runs both
pin-change fixtures through real TI. All four TI inputs pass.

SysConfig 1.26.3 (the version listed in the SDK release notes), full application
presets, a dedicated CC2340 CI installation job, and hardware operation remain
unverified. The existing AM2434 CI workflow and historical references are unchanged.

The adjacent `cc2340-pin-change` fixtures are a separate, minimal regression circuit,
not a replacement pedometer. Both TSX sources were built with the same 0.0.2463
compiler and command above (using `pin-change.circuit.tsx` as the filename), exiting
0. Changing only the TSX pin label from pin5/DIO12 to pin6/DIO13 regenerated the
stored JSON; identical converter options then resolve the new GPIO pin. No JSON
was hand-edited and the frozen v0.4.4 wiring was not changed. Real TI validation of
both variants passes in `validate:cc2340`. To reproduce, copy either `.tsx.txt` source into
the extracted source directory as `pin-change.circuit.tsx`, run the compiler, and
inspect `dist/pin-change/circuit.json`.
