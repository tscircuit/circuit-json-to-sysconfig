import { z } from "zod"

const name = z.string().regex(/^[A-Z][A-Z0-9_]*$/)
const sourcePortId = z.string().min(1)
const gpioIdentity = { source_port_id: sourcePortId, gpio_name: name }
const inputGpio = z
  .object({
    ...gpioIdentity,
    direction: z.literal("input"),
    pull: z.enum(["none", "up", "down"]),
    interrupt: z.enum(["none", "falling", "rising", "both"]),
  })
  .strict()
const outputGpio = z
  .object({
    ...gpioIdentity,
    direction: z.literal("output"),
    initial_state: z.enum(["low", "high"]),
  })
  .strict()

export const cc2340Options = z
  .object({
    source_component_id: z.string().min(1),
    gpios: z.array(z.discriminatedUnion("direction", [inputGpio, outputGpio])),
    i2c: z
      .object({
        i2c_name: name,
        sda_source_port_id: sourcePortId,
        scl_source_port_id: sourcePortId,
        /** Maximum bus bitrate in bits per second. */
        max_bit_rate: z.literal(100000),
        peripheral_assignment: z.enum(["suggested", "fixed"]),
      })
      .strict()
      .optional(),
    // Caller-declared ownership, resolved through source ports rather than duplicated pin numbers.
    reserved_ports: z.array(
      z
        .object({
          source_port_id: sourcePortId,
          reason: z.string().min(1),
        })
        .strict(),
    ),
    // No application preset is implicit. Additional RTOS/application support requires TI validation.
    firmware: z
      .object({
        rtos: z.literal("nortos"),
        lf_clock_source: z.enum(["lf_rcosc", "lf_xosc"]).optional(),
      })
      .strict(),
  })
  .strict()
  .refine((options) => options.gpios.length > 0 || options.i2c !== undefined, {
    message: "At least one GPIO or I2C request is required",
  })

export type Cc2340Options = z.infer<typeof cc2340Options>
export type Cc2340GpioRequest = Cc2340Options["gpios"][number]
