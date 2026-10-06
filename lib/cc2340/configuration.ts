import type { Cc2340Options } from "./options"

/** Internal authoring model. Omitted values stay omitted for TI to resolve. */
export type Cc2340GpioConfiguration = {
  source_port_id: string
  gpio_name: string
} & (
  | {
      direction: "input"
      pull?: "none" | "up" | "down"
      interrupt?: "none" | "falling" | "rising" | "both"
    }
  | { direction: "output"; initial_state?: "low" | "high" }
)

export type Cc2340I2cConfiguration = Omit<
  NonNullable<Cc2340Options["i2c"]>,
  "max_bit_rate"
> & {
  max_bit_rate?: 100000
}
