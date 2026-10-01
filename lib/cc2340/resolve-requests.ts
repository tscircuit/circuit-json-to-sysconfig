import type { CircuitJson } from "circuit-json"
import type { Cc2340Pin, Cc2340Target } from "../targets/cc2340r5rge"
import {
  type Cc2340GpioRequest,
  type Cc2340Options,
  cc2340Options,
} from "./options"
import { checkCc2340Function, resolveCc2340Port } from "./resolve-port"

export interface ResolvedCc2340Requests {
  target: Cc2340Target
  options: Cc2340Options
  gpios: { request: Cc2340GpioRequest; pin: Cc2340Pin }[]
  i2c?: {
    request: NonNullable<Cc2340Options["i2c"]>
    sda: Cc2340Pin
    scl: Cc2340Pin
  }
}

export function resolveCc2340Requests(
  options: Cc2340Options,
  ctx: { circuitJson: CircuitJson; target: Cc2340Target },
): ResolvedCc2340Requests {
  const validated = cc2340Options.parse(options)
  const portContext = {
    ...ctx,
    source_component_id: validated.source_component_id,
  }
  const usedPins = new Set<number>()
  const names = new Set<string>()
  for (const reserved of validated.reserved_ports) {
    const { pin } = resolveCc2340Port(reserved.source_port_id, portContext)
    if (usedPins.has(pin.pin))
      throw new Error(`Duplicate reserved physical pin ${pin.pin}`)
    usedPins.add(pin.pin)
  }
  const gpios = validated.gpios.map((request) => {
    const resolved = resolveCc2340Port(request.source_port_id, portContext)
    checkCc2340Function(resolved, request)
    claimPin(resolved.pin, usedPins)
    claimName(request.gpio_name, names)
    return { request, pin: resolved.pin }
  })
  const resolved: ResolvedCc2340Requests = {
    target: ctx.target,
    options: validated,
    gpios,
  }
  if (validated.i2c) {
    const request = validated.i2c
    const sda = resolveCc2340Port(request.sda_source_port_id, portContext)
    const scl = resolveCc2340Port(request.scl_source_port_id, portContext)
    if (sda.port.i2c_max_bit_rate !== undefined)
      throw new Error(
        `source_port ${sda.port.source_port_id}: i2c_max_bit_rate belongs on the SCL pin`,
      )
    if (
      scl.port.i2c_max_bit_rate !== undefined &&
      scl.port.i2c_max_bit_rate !== request.max_bit_rate
    )
      throw new Error(
        `source_port ${scl.port.source_port_id}: i2c_max_bit_rate conflicts with the request`,
      )
    checkCc2340Function(sda, "sda")
    checkCc2340Function(scl, "scl")
    claimPin(sda.pin, usedPins)
    claimPin(scl.pin, usedPins)
    claimName(request.i2c_name, names)
    if (
      !ctx.target.i2c.sdaPins.some((pin) => pin === sda.pin.pin) ||
      !ctx.target.i2c.sclPins.some((pin) => pin === scl.pin.pin)
    )
      throw new Error(
        `Unsupported ${ctx.target.i2c.peripheral} pin pair; this scope supports SDA pin ${ctx.target.i2c.sdaPins.join(", ")} and SCL pin ${ctx.target.i2c.sclPins.join(", ")}`,
      )
    resolved.i2c = { request, sda: sda.pin, scl: scl.pin }
  }
  if (
    (usedPins.has(14) || usedPins.has(15)) &&
    validated.firmware.lf_clock_source !== "lf_rcosc"
  ) {
    throw new Error(
      'DIO3_X32P/DIO4_X32N are requested or reserved; firmware.lf_clock_source must be "lf_rcosc" to avoid the SDK default external LF crystal using these pins',
    )
  }
  return resolved
}

function claimPin(pin: Cc2340Pin, usedPins: Set<number>) {
  if (usedPins.has(pin.pin))
    throw new Error(
      `Physical pin ${pin.pin} (${pin.identifier}) is already requested or reserved`,
    )
  usedPins.add(pin.pin)
}

function claimName(name: string, names: Set<string>) {
  if (names.has(name)) throw new Error(`Duplicate instance name ${name}`)
  names.add(name)
}
