# Real TI validation

`bun run validate:ti` passed (exit 0) on 2026-09-29 against converter/runner commit
`d3583a2245be6ea1ce0cb27df0d4138768ed70b2`. No converter, runner, or assertion changes
were needed. Subsequent changes only record these results.

## Environment

| Item | Observed value |
| --- | --- |
| Host | macOS 26.6.2 (25G83), Darwin 25.6.0, arm64 |
| SysConfig CLI | `1.14.0+2667`, confirmed by `--version` |
| Bundled runtime | Node `v14.16.0`, Mach-O x86_64, executed through Rosetta |
| Bun | `1.3.9` |
| SDK source tag | `REL.MCUSDK.08.06.00.34` |
| SDK source HEAD | `e7e068494bbd5714d6d34c55b10184a5bd84ed30` |
| SDK manifest | `MCU_PLUS_SDK@07.03.01` (unchanged historical metadata) |
| Device / part / package / context | `AM243x_ALV_beta` / `ALV` / `ALV` / `r5fss0-0` |

Downloaded the official
[SysConfig 1.14.0+2667 macOS installer](https://software-dl.ti.com/ccs/esd/sysconfig/sysconfig-1.14.0_2667-setup.dmg)
from TI's release archive. Its SHA-256 was
`e5f4c1de5e0b74cf6300637ee568fc36abdf9c9e73ea407bbb43832e4b7fea6d`.
The Intel installer completed in text mode after explicit user approval of TI's
license. The installed `nodejs/node` had mode 0644; adding owner execute permission
allowed the original bundled binary to run. No binary or SDK contents were patched.

The first sandboxed run failed before generation because TI could not write its
product registry at `~/TI_pinmux/products.json`. The rerun with the required filesystem
access passed. This was an environment permission failure, not rejected SysConfig input.

## Invocation

The installation and SDK were kept outside the repository. In this task's directory,
`work/ti-env/sysconfig_1.14.0` contains SysConfig and `work/ti-env/mcupsdk-core` is the
pinned SDK checkout. From the repository at `work/circuit-json-to-sysconfig`:

```sh
export TI_SYSCONFIG_NODE="$(cd ../ti-env/sysconfig_1.14.0/nodejs && pwd)/node"
export TI_SYSCONFIG_CLI="$(cd ../ti-env/sysconfig_1.14.0/dist && pwd)/cli.js"
export TI_SDK_ROOT="$(cd ../ti-env/mcupsdk-core && pwd)"
mkdir -p ../../outputs/ti-validation/runs
export TMPDIR="$(cd ../../outputs/ti-validation/runs && pwd)"
set -o pipefail
bun run validate:ti 2>&1 | tee ../../outputs/ti-validation/validation-runtime.log
```

The recorded run sourced an environment file containing these same resolved absolute
paths. The unchanged runner invokes the bundled runtime and CLI separately for each
input with `--product "$TI_SDK_ROOT/.metadata/product.json" --context r5fss0-0
--part ALV --package ALV --output <fresh-directory> <input>`.

## Observed results

| Input | Result |
| --- | --- |
| Native reference | PASS: GPIO_LED, MCU_GPIO0 base, pin 5, output, A7 / MCU_SPI1_CS0, mode 7 |
| Round-tripped reference | PASS: same GPIO macros and normalized pinmux C as native |
| Converted A7 | PASS: GPIO_CONVERTED, MCU_GPIO0 base, pin 5, output, A7 / MCU_SPI1_CS0, mode 7 |
| Converted B7 | PASS: GPIO_CONVERTED, MCU_GPIO0 base, pin 6, output, B7 / MCU_SPI1_CS1, mode 7 |

All four TI processes generated nonempty `ti_drivers_config.c`,
`ti_drivers_config.h`, and `ti_pinmux_config.c` files. Each converted pinmux output
contains zero main-domain reservations and exactly one MCU-domain reservation:
`PIN_MCU_SPI1_CS0` for A7 or `PIN_MCU_SPI1_CS1` for B7. The strict existing reader
accepted genuine TI output without adjustment. The native reference retains its
UART configuration; converted outputs do not reserve UART pins.

The unchanged native fixture still has SHA-256
`8c4e299f85cc2678def58b5813631cc6a094c46dd41ea62b242dce68b2d8f11e`.

## Preserved evidence

The task's `outputs/ti-validation/` directory retains:

- `validation.log`: original sandbox permission failure.
- `validation-runtime.log`: complete successful stdout/stderr.
- `setup-status.json`: versions, exact local paths, exit status, and results.
- `environment.sh`: actual resolved runtime/CLI/SDK paths.
- `sdk-product.json`: the original SDK manifest.
- `SHA256SUMS`: hashes of the retained evidence and generated files.
- `runs/circuit-json-to-sysconfig-WRK4jo/`: all four fresh inputs and generated
  outputs, including every file emitted by TI.

Evidence remains local to the task; TI installers, SDK sources, and generated C
are not vendored into this repository. This records the original local real-TI run. The subsequent
[CI workflow](../.github/workflows/ti-validation.yml) repeats the same validation on
Linux and retains its own logs and outputs as GitHub Actions artifacts. See the
[root README](../README.md#real-ti-validation-in-ci) for that setup.
Firmware compilation and hardware execution remain **NOT RUN**.
