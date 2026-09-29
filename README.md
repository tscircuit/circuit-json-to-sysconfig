# circuit-json-to-sysconfig

Convert one Circuit JSON GPIO request into a TI SysConfig document. The initial
scope is **AM2434BSDFHIALVR**, ALV package, R5F core `r5fss0-0`, with output on
ball **A7** (`MCU_GPIO0_5`) or **B7** (`MCU_GPIO0_6`). These mappings are documented;
**real TI generation is NOT RUN**. This is not an approved demo-hardware choice.

## Library usage

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

## Supported input

Select one `source_component` with `ftype: "simple_chip"` and the exact MPN above,
and one `source_port` belonging to it. An exact package-ball label must appear in
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
There is no multi-GPIO conversion, other peripheral support, automatic pin movement,
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

`bun run format` applies Biome fixes. CI runs the three checks above independently.
The package exposes TypeScript directly from `lib/index.ts`; there is no build or
publishing step. Lockfile generation is intentionally disabled.

Tested locally: Bun 1.3.9, TypeScript 5.9.3, Biome 2.5.14, `@types/bun` 1.4.2,
and sysconfigts at
[`21f9b7e6ad941d8925581ba0d7d084a575ee1454`](https://github.com/tscircuit/sysconfigts/commit/21f9b7e6ad941d8925581ba0d7d084a575ee1454).
The GitHub dependency is pinned to that revision. Circuit JSON is pinned to
`0.0.506`; Zod `3.25.76` is an explicit runtime dependency because that Circuit JSON
release imports Zod without declaring it as a runtime dependency.

## Run TI validation

The unchanged native GPIO LED blink reference remains a regression input.
Its history and license are in the [fixture README](tests/fixtures/ti-reference/README.md).
The same runner also validates converter-generated A7 and B7 inputs.

Obtain SysConfig **1.14.0+2667** from TI's
[release archive](https://software-dl.ti.com/ccs/esd/sysconfig/docs/release_archive.html)
and use the pinned MCU+ SDK source below on a supported host. Installation and
any required license acceptance are manual prerequisites. No TI installation is
performed by this repository. Keep the SDK outside this repository:

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
still needs its first real-TI run. The runner does not enforce installed versions;
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
ball, actual mux-mode-7 entry, and no additional pin reservations.
The printed temporary directory is retained for review, including on failure.
The checked-in fixture is never an output path. Missing prerequisites, failed TI
processes, missing outputs, and mismatched configuration all return nonzero.

## Verification status

- **Passed:** converter/target tests, including A7 → B7, rejection cases,
  determinism, and input preservation; unchanged native-reference tests;
  controlled subprocess tests for all four inputs; typecheck and formatting.
- **NOT RUN:** real TI generation for native, round-trip, converted A7, or
  converted B7. No SysConfig runtime/CLI/device database or complete matching SDK
  is installed, and none of the three environment variables is configured.
  `bun run validate:ti` fails with `Set TI_SYSCONFIG_NODE`.
- **NOT RUN:** firmware compilation and hardware execution.

Controlled subprocess tests are not evidence of TI acceptance. Parsing cannot
resolve pins or validate effective SDK defaults. The PR must remain draft until
the documented TI installation accepts all four inputs and confirms both mappings.
