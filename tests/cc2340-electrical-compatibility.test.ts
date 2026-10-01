import { expect, test } from "bun:test"
import { loadPedometerCircuit } from "../examples/pedometer/load-circuit"
import { pedometerOptions } from "../examples/pedometer/options"
import {
  type Cc2340GpioRequest,
  convertCircuitJsonToSysConfig,
} from "../lib/index"

const circuit = await loadPedometerCircuit()
type ElectricalAttribute =
  | "is_using_internal_pullup"
  | "is_using_internal_pulldown"
  | "is_using_push_pull"
  | "is_using_open_drain"

const input = {
  source_port_id: "source_port_99",
  gpio_name: "CONFIG_SIGNAL",
  direction: "input",
  interrupt: "none",
} as const
const output: Cc2340GpioRequest = {
  source_port_id: "source_port_99",
  gpio_name: "CONFIG_SIGNAL",
  direction: "output",
  initial_state: "low",
}

function convertDeclaredGpio(settings: {
  attributes: ElectricalAttribute[]
  request: Cc2340GpioRequest
}) {
  const declared = structuredClone(circuit)
  const port = declared.find(
    (element) =>
      element.type === "source_port" &&
      element.source_port_id === settings.request.source_port_id,
  )
  if (port?.type !== "source_port") throw new Error("Missing fixture port")
  for (const attribute of settings.attributes) port[attribute] = true
  return convertCircuitJsonToSysConfig(declared, {
    source_component_id: "source_component_25",
    gpios: [settings.request],
    reserved_ports: [],
    firmware: { rtos: "nortos" },
  }).getString()
}

const matching: {
  attribute: ElectricalAttribute
  request: Cc2340GpioRequest
  assignment: string
}[] = [
  {
    attribute: "is_using_internal_pullup",
    request: { ...input, pull: "up" },
    assignment: 'GPIO1.pull = "Pull Up"',
  },
  {
    attribute: "is_using_internal_pulldown",
    request: { ...input, pull: "down" },
    assignment: 'GPIO1.pull = "Pull Down"',
  },
  {
    attribute: "is_using_push_pull",
    request: output,
    assignment: 'GPIO1.outputType = "Standard"',
  },
]

for (const match of matching) {
  test(`accepts matching ${match.attribute} and emits the requested electrical setting`, () => {
    const text = convertDeclaredGpio({
      attributes: [match.attribute],
      request: match.request,
    })
    expect(text).toContain(match.assignment)
    expect(text).toBe(
      convertDeclaredGpio({ attributes: [], request: match.request }),
    )
  })
}

const conflicting: {
  attribute: ElectricalAttribute
  request: Cc2340GpioRequest
}[] = [
  {
    attribute: "is_using_internal_pullup",
    request: { ...input, pull: "none" },
  },
  {
    attribute: "is_using_internal_pullup",
    request: { ...input, pull: "down" },
  },
  { attribute: "is_using_internal_pullup", request: output },
  {
    attribute: "is_using_internal_pulldown",
    request: { ...input, pull: "none" },
  },
  {
    attribute: "is_using_internal_pulldown",
    request: { ...input, pull: "up" },
  },
  { attribute: "is_using_internal_pulldown", request: output },
  { attribute: "is_using_push_pull", request: { ...input, pull: "none" } },
  { attribute: "is_using_open_drain", request: output },
  { attribute: "is_using_open_drain", request: { ...input, pull: "none" } },
]

for (const conflict of conflicting) {
  test(`rejects ${conflict.attribute} with ${JSON.stringify(conflict.request)}`, () => {
    expect(() =>
      convertDeclaredGpio({
        attributes: [conflict.attribute],
        request: conflict.request,
      }),
    ).toThrow(`${conflict.attribute} conflicts`)
  })
}

test("a matching declaration does not hide contradictory electrical declarations", () => {
  for (const pull of ["up", "down"] as const) {
    expect(() =>
      convertDeclaredGpio({
        attributes: ["is_using_internal_pullup", "is_using_internal_pulldown"],
        request: { ...input, pull },
      }),
    ).toThrow("conflicts")
  }
  expect(() =>
    convertDeclaredGpio({
      attributes: ["is_using_push_pull", "is_using_open_drain"],
      request: output,
    }),
  ).toThrow("is_using_open_drain conflicts")
})

test("I2C accepts open-drain SDA and SCL without changing the TI configuration", () => {
  const declared = structuredClone(circuit)
  for (const source_port_id of ["source_port_97", "source_port_113"]) {
    const port = declared.find(
      (element) =>
        element.type === "source_port" &&
        element.source_port_id === source_port_id,
    )
    if (port?.type !== "source_port")
      throw new Error("Missing I2C fixture port")
    port.is_using_open_drain = true
  }
  expect(
    convertCircuitJsonToSysConfig(declared, pedometerOptions).getString(),
  ).toBe(convertCircuitJsonToSysConfig(circuit, pedometerOptions).getString())
})

test("open-drain I2C still rejects conflicting electrical declarations on either pin", () => {
  const attributes: ElectricalAttribute[] = [
    "is_using_internal_pullup",
    "is_using_internal_pulldown",
    "is_using_push_pull",
  ]
  for (const source_port_id of ["source_port_97", "source_port_113"]) {
    for (const attribute of attributes) {
      const declared = structuredClone(circuit)
      const port = declared.find(
        (element) =>
          element.type === "source_port" &&
          element.source_port_id === source_port_id,
      )
      if (port?.type !== "source_port")
        throw new Error("Missing I2C fixture port")
      port.is_using_open_drain = true
      port[attribute] = true
      expect(() =>
        convertCircuitJsonToSysConfig(declared, pedometerOptions),
      ).toThrow(`${attribute} conflicts`)
    }
  }
})
