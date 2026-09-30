# circuit-json-to-sysconfig

Convert Circuit JSON GPIO/I2C requests into a TI SysConfig document. The verified
AM2434 scope is **AM2434BSDFHIALVR**, ALV package, R5F core `r5fss0-0`, with output on
ball **A7** (`MCU_GPIO0_5`) or **B7** (`MCU_GPIO0_6`). These mappings are documented and
**real TI generation passed for all four validation inputs**. CC2340 support uses
the actual **pedometer v0.4.4** source: three GPIOs and one I2C bus. Its unit tests
pass; **CC2340 real TI validation is NOT RUN**, pending separate license approval.

## Pedometer v0.4.4 example

```ts
import { convertCircuitJsonToSysConfig } from "circuit-json-to-sysconfig"
import { loadPedometerCircuit } from "./examples/pedometer/load-circuit"
import { pedometerOptions } from "./examples/pedometer/options"

const config = convertCircuitJsonToSysConfig(
  await loadPedometerCircuit(),
  pedometerOptions,
)
console.log(config.getString())
```

Run `bun examples/pedometer/export.ts` to write `generated/pedometer.syscfg`.
The example requests display isolation on DIO20 (initially High), charger low-power
control on DIO3 (initially Low), accelerometer input on DIO12 (no pull/interrupt),
and I2C SDA/SCL on DIO8/DIO6 at 100000 bit/s. The public `max_bit_rate` option
uses **bits/s**; the exporter divides it by 1000 to write TI's `maxBitRate` in
**kbit/s** (`100000` becomes the numeric value `100`). Options refer to source-port IDs;
physical assignments come from Circuit JSON. Multiple GPIOs preserve request order.
Input pull/interrupt and output startup levels are required, explicit choices.

Display bus/control and SWD ownership is declared in `reserved_ports`; overlap
fails. Display SPI, D/C/reset behavior, firmware application presets, additional
I2C routes, and automatic pin movement are unsupported. The example explicitly
selects NoRTOS; no BLE/FreeRTOS/NVS application settings are copied. Unsupported
fields/functions throw. This is GPIO/I2C support, not complete display support or
a verified pedometer firmware application.

See the single [pedometer provenance record](tests/fixtures/pedometer/README.md)
for source hashes, source-build reproduction, exact pin mapping, four historical
reference conflicts, TI prerequisites, and pending validation. The supplied
reference remains unchanged and is labeled unmatched. A separate v0.4.4 reference
candidate awaits independent TI execution before use as an expected hardware result.

## AM2434 library usage

```ts
import type { CircuitJson } from "circuit-json"
import { convertCircuitJsonToSysConfig } from "circuit-json-to-sysconfig"

const circuitJson: CircuitJson = [
  {
    type: "source_component",
    ftype: "simple_chip",
    source_component_id: "mcu",
    name: "U1",
    manufacturer_part_number: "AM2434BSDFHIALVR",
  },
  {
    type: "source_port",
    source_port_id: "gpio_output",
    source_component_id: "mcu",
    name: "GPIO_OUTPUT",
    port_hints: ["A7"],
  },
]

const config = convertCircuitJsonToSysConfig(circuitJson, {
  source_component_id: "mcu",
  source_port_id: "gpio_output",
  gpio_name: "GPIO_LED",
  direction: "output",
})
console.log(config.getString())
```

Changing the port's `port_hints` to `["B7"]` changes the fixed physical assignment;
the options stay the same. The library returns a `SysConfig` model, does not mutate
inputs, and performs no file access or TI execution.

### Incremental conversion

```ts
import { CircuitJsonToSysConfigConverter } from "circuit-json-to-sysconfig"

const converter = new CircuitJsonToSysConfigConverter(circuitJson, {
  source_component_id: "mcu",
  source_port_id: "gpio_output",
  gpio_name: "GPIO_LED",
  direction: "output",
})
while (!converter.finished) converter.step()
console.log(converter.getOutput().getString())
```

Each `step()` performs one stage: resolve the MCU/target, validate the GPIO request,
then construct the document. `runUntilFinished()` runs the remaining stages; the
convenience function above wraps that same class. The constructor snapshots inputs,
so later caller edits do not change an in-progress conversion. `getOutput()` throws
until completion. A failed step throws without advancing, and steps after completion
are harmless. No incomplete document is returned.

### Inspect the exported source

```ts
import { inspectSysConfig } from "sysconfigts"

console.log(inspectSysConfig(config))
```

Inspection returns ordered text rows for headers, modules, instances, and assignments.
Fixed `$assign` settings remain distinct from `$suggestSolution` suggestions. It is
deterministic and does not modify the document or evaluate TI scripts/device defaults.
Reviewed inline snapshots cover A7/B7 inspection and serialization/re-parsing.

## AM2434 supported input

Select one `source_component` with `ftype: "simple_chip"` and the exact MPN above,
and one `source_port` belonging to it. Physical identity follows the documented ALV
21×21 ball grid: rows A–H, J–N, P, R, T–W, Y, AA; columns 1–21. Thus `CS1` is a
signal alias, while unsupported real balls such as `C7` or `AA21` still participate
in conflict detection. An exact package-ball label must appear in
`name` or `port_hints`; repeated identical labels are allowed. `pin_number` stays
numeric and never determines a BGA ball. Names such as `LED at A7`, numeric aliases,
and signal-only aliases do not supply a physical identity.

Missing/ambiguous identities, contradictory known signal aliases, duplicate port
IDs, another MCU port claiming the same known pin or numeric identity, other MPNs,
and unsupported balls throw errors. Active UART/I2C/SPI, power/ground, do-not-connect,
and explicit electrical-mode requests on the selected port are rejected. Capability
flags alone do not activate a function. Firmware names must start with `A-Z` and
contain only `A-Z`, digits, and underscores; direction must be `"output"`.

Conversion uses source records, independently of PCB routing. It constructs one
GPIO instance and disables debug UART pin allocation. SDK system defaults supply
required infrastructure; the native demo's UART and MPU settings are not copied.
The AM2434 API has no multi-GPIO conversion, other peripheral support, automatic pin movement,
TSX compilation, user-facing CLI, or firmware application generation.

See [target provenance](lib/targets/README.md) for the exact device/SDK mapping,
Circuit JSON schema references, setup rationale, and license notice.

## Development

Use Bun 1.3.9:

```sh
bun install
bun test
bun run typecheck
bun run format:check
```

`bun run format` applies Biome fixes. CI runs the three checks above independently,
plus the real TI validation described below.
The package exposes TypeScript directly from `lib/index.ts`; there is no build or
publishing step. Lockfile generation is intentionally disabled.

Tested locally with Bun 1.3.9, TypeScript 5.9.3, Biome 2.5.14, and `@types/bun` 1.4.2.
The dependency pins the merged [sysconfigts PR #1](https://github.com/tscircuit/sysconfigts/pull/1)
commit [`35381191fb3946185632d9c4c2ac4c2e69329535`](https://github.com/tscircuit/sysconfigts/commit/35381191fb3946185632d9c4c2ac4c2e69329535),
which exports `inspectSysConfig()`. This does not replace the real-TI gate.
Circuit JSON is pinned to `0.0.506`; Zod `3.25.76` is an explicit runtime dependency
because that Circuit JSON release imports Zod without declaring it as a runtime
dependency.

## Run TI validation

The unchanged native GPIO LED blink reference remains a regression input.
Its history and license are in the [fixture README](tests/fixtures/ti-reference/README.md).
The same runner also validates converter-generated A7 and B7 inputs.

Obtain SysConfig **1.14.0+2667** from TI's
[release archive](https://software-dl.ti.com/ccs/esd/sysconfig/docs/release_archive.html)
and use the pinned MCU+ SDK source below on a supported host. Installation and
any required license acceptance are prerequisites for local runs. The CI workflow
automates installation as documented below. Keep the SDK outside this repository:

```sh
git clone --depth 1 --branch REL.MCUSDK.08.06.00.34 \
  https://github.com/TexasInstruments/mcupsdk-core.git /path/to/mcupsdk-core
git -C /path/to/mcupsdk-core rev-parse HEAD
# Expected: e7e068494bbd5714d6d34c55b10184a5bd84ed30

TI_SYSCONFIG_NODE="/path/to/sysconfig_1.14.0/nodejs/node" \
TI_SYSCONFIG_CLI="/path/to/sysconfig_1.14.0/dist/cli.js" \
TI_SDK_ROOT="/path/to/mcupsdk-core" \
  bun run validate:ti
```

All three environment variables are required. Set them to the actual local
runtime, CLI script, and SDK root; no PATH discovery or developer-specific paths
are used. The source checkout supplies the inspected SDK metadata; the separate
SysConfig installation supplies its runtime and device database. This combination
passed real TI generation on macOS 26.6.2 arm64 using the bundled x86_64 Node
v14.16.0 through Rosetta. The runner does not enforce installed versions;
use the pinned inputs above when reproducing this reference.

The runner follows the upstream example makefile's invocation:

```sh
"$TI_SYSCONFIG_NODE" "$TI_SYSCONFIG_CLI" \
  --product "$TI_SDK_ROOT/.metadata/product.json" \
  --context r5fss0-0 --part ALV --package ALV \
  --output /fresh/output/directory /copy/of/reference.syscfg
```

Each input supplies the device selection. The explicit `--product` supplies the
SDK metadata instead of relying on the historical product ID in its header.
There is no board-selection flag in this native example.

Each run checks input paths, then copies the native source and the unmodified
sysconfigts round trip to separate fresh OS temporary directories. It runs TI for
both copies, preserves stdout/stderr, and requires nonempty
`ti_drivers_config.c`, `ti_drivers_config.h`, and `ti_pinmux_config.c` outputs.
It checks the resolved GPIO base, pin, direction, and A7 mapping, then compares all
`GPIO_LED_*` macros and pinmux C code (ignoring block comments and whitespace).
It then generates separate converted A7 and B7 configurations, checking each
circuit-derived expectation: GPIO base, pin, output direction, resolved package
ball, actual mux-mode-7 entry, and the exact configured pin set. It reads both
main/MCU initializer arrays, excluding `PINMUX_END`, and rejects unannotated extras,
duplicate reservations, and unrecognized forms in the pinned TI output format.
The printed temporary directory is retained for review, including on failure.
The checked-in fixture is never an output path. Missing prerequisites, failed TI
processes, missing outputs, and mismatched configuration all return nonzero.

## Real TI validation in CI

[TI SysConfig validation](.github/workflows/ti-validation.yml) runs on pull requests,
pushes to `main`, and manual dispatch using an Ubuntu 22.04 x86_64 GitHub runner.
It installs the official Linux SysConfig **1.14.0+2667** release, checks the downloaded
installer against its pinned SHA-256, verifies the CLI version, and checks out SDK
revision **e7e068494bbd5714d6d34c55b10184a5bd84ed30** directly. It uses TI's bundled
Node runtime and the same `bun run validate:ti` command used locally.

The job validates the native reference, its round trip, and converter-generated
A7/B7 inputs. Native/round-trip GPIO macros and pinmux code must match; converted
outputs must satisfy the independent pin, direction, mux-mode, and exact reservation
checks. A download, setup, TI process, or assertion failure fails the job. Bash
`pipefail` preserves failure status when output is copied to a log.

Each run uploads a `ti-validation-<run-id>-<attempt>` artifact for 14 days, including
setup/version logs, the SDK manifest, validation stdout/stderr, and fresh inputs and
generated outputs. Upload is attempted on failure too, retaining partial evidence.
Installers and the SDK checkout stay outside the artifact and repository. No TI
account credentials or repository secrets are required.

The workflow uses TI's unattended installer, which accepts the TI license. Enabling
or running it requires authorization to accept those terms for use with TI devices,
as obtained for this setup. Forks should review the same license before enabling
this workflow. Linux installer source:
[official TI archive](https://software-dl.ti.com/ccs/esd/sysconfig/docs/release_archive.html);
SHA-256: `0ff048df222151d34757aae3bec01ee586a85e1641dadeda7b227a7055b501b4`.

## AM2434 verification status

- **Passed:** 127 tests and 2 reviewed inline snapshots, covering staged/wrapper
  equivalence, A7 → B7, malformed names, ball/alias conflicts, output inspection,
  and strict pinmux reading; unchanged native-reference tests; controlled
  subprocess tests for all four inputs; typecheck and formatting.
- **Passed:** real TI generation for native, round-trip, converted A7, and
  converted B7 using SysConfig 1.14.0+2667 and SDK revision
  `e7e068494bbd5714d6d34c55b10184a5bd84ed30`. `bun run validate:ti` exited 0.
  Native/round-trip GPIO macros and pinmux code matched. Converted A7/B7 resolved
  to MCU_GPIO0_5/6, respectively, in output direction and mux mode 7, with exactly
  one MCU-domain pin and no main-domain pins per converted output. See the
  [execution record](docs/ti-validation.md) for versions, setup, and retained evidence.
- **NOT RUN:** firmware compilation and hardware execution.

Controlled subprocess tests alone are not evidence of TI acceptance. The real-TI
run above separately confirmed the mappings and effective pin reservations. This
validates configuration generation, not firmware compilation or hardware operation.
