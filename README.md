# circuit-json-to-sysconfig

Foundation for converting Circuit JSON into TI SysConfig configurations.
This first PR provides repository tooling, an unchanged official TI GPIO fixture,
sysconfigts compatibility tests, and an explicit TI code-generation check.
There is no converter or user-facing CLI yet; `lib/index.ts` exports nothing.

sysconfigts owns parsing, document objects, editing, and serialization. This
package will own circuit interpretation and TI mapping. TI SysConfig and the
matching SDK validate effective configuration and generate target-specific code.

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
The GitHub dependency is pinned to that revision.

## Run the TI reference check

The reference is **provisional**, not an approved demo-chip selection. It targets
AM243x ALV, core `r5fss0-0`, using TI's GPIO LED blink example. Exact versions,
source links, native header metadata, licensing, and configuration support are
recorded in the [fixture README](tests/fixtures/ti-reference/README.md).

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

The fixture supplies the device selection. The explicit `--product` supplies the
SDK metadata instead of relying on the historical product ID in its header.
There is no board-selection flag in this native example.

Each run checks input paths, then copies the native source and the unmodified
sysconfigts round trip to separate fresh OS temporary directories. It runs TI for
both copies, preserves stdout/stderr, and requires nonempty
`ti_drivers_config.c`, `ti_drivers_config.h`, and `ti_pinmux_config.c` outputs.
It checks the resolved GPIO base, pin, direction, and A7 mapping, then compares all
`GPIO_LED_*` macros and pinmux C code (ignoring block comments and whitespace).
The printed temporary directory is retained for review, including on failure.
The checked-in fixture is never an output path. Missing prerequisites, failed TI
processes, missing outputs, and mismatched configuration all return nonzero.

## Verification status

- **Passed:** fixture parsing, exact round trip, explicit assignments, and a
  GPIO-name edit preserving every unrelated byte; runner behavior tests.
- **NOT RUN:** real TI generation for either copy. This environment has no
  SysConfig runtime/CLI/device database or complete matching SDK installation;
  no `TI_SYSCONFIG_NODE`, `TI_SYSCONFIG_CLI`, or `TI_SDK_ROOT` is configured.
  Running `bun run validate:ti` fails clearly on the first missing variable.
- **NOT RUN:** firmware compilation and hardware execution.

Controlled subprocess tests exercise failure handling and comparison behavior;
they are not evidence of TI acceptance. Parsing does not evaluate SDK defaults,
resolve pins, or validate the effective device configuration.

Next milestone: confirm the demo's manufacturer part number and verify its TI
device/package/SDK mapping, run the native TI baseline, then implement one real
GPIO conversion from Circuit JSON. Circuit JSON alone is insufficient.
