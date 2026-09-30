// Source references and the deliberately limited pin set are in README.md.
export const am2434bsdfhialvr = {
  manufacturer_part_number: "AM2434BSDFHIALVR",
  device: "AM243x_ALV_beta",
  package: "ALV",
  part: "ALV",
  context: "r5fss0-0",
  product: "MCU_PLUS_SDK@07.03.01",
  // TI ALV0441A drawing 4225999/A: a populated 21 × 21 grid (see README.md).
  packageBallPattern: /^(?:[A-HJ-NPRT-WY]|AA)(?:[1-9]|1[0-9]|2[01])$/,
  gpioPins: [
    { ball: "A7", peripheral: "MCU_GPIO0", pin: 5, devicePin: "MCU_SPI1_CS0" },
    { ball: "B7", peripheral: "MCU_GPIO0", pin: 6, devicePin: "MCU_SPI1_CS1" },
  ],
} as const

export type TiTarget = typeof am2434bsdfhialvr

// Preserve the existing internal import path; resolution is shared by both targets.
export { resolveTiTarget } from "./resolve-ti-target"
