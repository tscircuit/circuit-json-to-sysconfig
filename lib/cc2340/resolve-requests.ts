import type { CircuitJson } from "circuit-json"
import { type Cc2340Pin, cc2340r5rge } from "../targets/cc2340r5rge"
import {
  type Cc2340GpioRequest,
  type Cc2340Options,
  cc2340Options,
} from "./options"
import { checkCc2340Function, resolveCc2340Port } from "./resolve-port"

export interface ResolvedCc2340Requests {
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
  circuitJson: CircuitJson,
): ResolvedCc2340Requests {
  const validated = cc2340Options.parse(options)
  const ctx = {
    circuitJson,
    source_component_id: validated.source_component_id,
  }
  const usedPins = new Set<number>()
  const names = new Set<string>()
  for (const reserved of validated.reserved_ports) {
    const { pin } = resolveCc2340Port(reserved.source_port_id, ctx)
    if (usedPins.has(pin.pin))
      throw new Error(`Duplicate reserved physical pin ${pin.pin}`)
    usedPins.add(pin.pin)
  }
  const gpios = validated.gpios.map((request) => {
    const resolved = resolveCc2340Port(request.source_port_id, ctx)
    checkCc2340Function(resolved, "gpio")
    claimPin(resolved.pin, usedPins)
    claimName(request.gpio_name, names)
    return { request, pin: resolved.pin }
  })
  const resolved: ResolvedCc2340Requests = { options: validated, gpios }
  if (validated.i2c) {
    const request = validated.i2c
    const sda = resolveCc2340Port(request.sda_source_port_id, ctx)
    const scl = resolveCc2340Port(request.scl_source_port_id, ctx)
    checkCc2340Function(sda, "sda")
    checkCc2340Function(scl, "scl")
    claimPin(sda.pin, usedPins)
    claimPin(scl.pin, usedPins)
    claimName(request.i2c_name, names)
    if (
      !cc2340r5rge.i2c.sdaPins.some((pin) => pin === sda.pin.pin) ||
      !cc2340r5rge.i2c.sclPins.some((pin) => pin === scl.pin.pin)
    )
      throw new Error(
        "Unsupported I2C0 pin pair; this scope supports SDA pin 3 and SCL pin 19",
      )
    resolved.i2c = { request, sda: sda.pin, scl: scl.pin }
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
