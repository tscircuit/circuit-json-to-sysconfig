// TI SWRS272F, RGE pin table. Provenance and validation status: tests/fixtures/pedometer/README.md.
export const cc2340r5rge = {
  manufacturer_part_number: "CC2340R52E0RGER",
  device: "CC2340R5RGE",
  package: "RGE",
  part: "Default",
  product: "simplelink_lowpower_f3_sdk@9.21.00.36",
  v2: { device: "CC2340R5", package: "VQFN (RGE)" },
  // Defaults at lpf3-9.21.00.36_LTS, not application GPIO choices.
  // GPIOLPF3.syscfg.js _getDefaultAttrs() preserves SWD reset settings.
  defaultDebugPins: [7, 8],
  lfCrystalPins: [14, 15],
  gpioPins: [
    { pin: 3, identifier: "DIO8", aliases: ["DIO8"] },
    { pin: 4, identifier: "DIO11", aliases: ["DIO11"] },
    { pin: 5, identifier: "DIO12", aliases: ["DIO12"] },
    { pin: 6, identifier: "DIO13", aliases: ["DIO13"] },
    { pin: 7, identifier: "DIO16_SWDIO", aliases: ["DIO16_SWDIO"] },
    { pin: 8, identifier: "DIO17_SWDCK", aliases: ["DIO17_SWDCK"] },
    { pin: 9, identifier: "DIO20_A11", aliases: ["DIO20_A11"] },
    { pin: 10, identifier: "DIO21_A10", aliases: ["DIO21_A10"] },
    { pin: 12, identifier: "DIO24_A7", aliases: ["DIO24_A7"] },
    { pin: 14, identifier: "DIO3_X32P", aliases: ["DIO3_X32P"] },
    { pin: 15, identifier: "DIO4_X32N", aliases: ["DIO4_X32N"] },
    { pin: 19, identifier: "DIO6_A1_AR+", aliases: ["DIO6_A1", "DIO6_A1_AR+"] },
  ],
  // Deliberately limited I2C scope; additional mux routes need independent TI validation.
  i2c: { peripheral: "I2C0", sdaPins: [3], sclPins: [19] },
} as const

export type Cc2340Pin = (typeof cc2340r5rge.gpioPins)[number]
export type Cc2340Target = typeof cc2340r5rge
