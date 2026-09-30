import { any_circuit_element, type CircuitJson } from "circuit-json"
import { z } from "zod"

export async function loadPedometerCircuit(): Promise<CircuitJson> {
  const records = z
    .array(z.record(z.unknown()))
    .parse(
      await Bun.file(
        new URL(
          "../../tests/fixtures/pedometer/circuit.json.txt",
          import.meta.url,
        ),
      ).json(),
    )
  // This converter consumes source records. Preserve the original fixture bytes;
  // schematic/PCB records are outside this example's input projection.
  return any_circuit_element
    .array()
    .parse(
      records.filter(
        (record) =>
          typeof record.type === "string" && record.type.startsWith("source_"),
      ),
    )
}
