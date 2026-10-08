import {
  type CircuitJson,
  source_component_base,
  source_component_internal_connection,
  source_net,
  source_port,
  source_simple_chip,
  source_simple_crystal,
  source_trace,
} from "circuit-json"
import { z } from "zod"
import { validatePinCapabilities } from "./validate-pin-capabilities"

const circuitRecord = z.object({ type: z.string() }).passthrough()
type CircuitRecord = z.infer<typeof circuitRecord>

function formatRecordLabel(
  record: CircuitRecord,
  ctx: { records: CircuitRecord[]; recordIndex: number },
): string {
  if (record.type === "source_port") {
    const component = ctx.records.find(
      (candidate) =>
        candidate.type === "source_component" &&
        candidate.source_component_id === record.source_component_id,
    )
    const componentName =
      typeof component?.name === "string" ? component.name : "Component"
    const pinNumber =
      typeof record.pin_number === "number" ? record.pin_number : "unspecified"
    const pinName = typeof record.name === "string" ? ` (${record.name})` : ""
    return `${componentName} pin ${pinNumber}${pinName}`
  }
  if (record.type === "source_component" && typeof record.name === "string")
    return record.name
  return `${record.type} record ${ctx.recordIndex + 1}`
}

function formatValidationIssue(issue: z.ZodIssue): string {
  if (issue.code === "unrecognized_keys")
    return `unknown field${issue.keys.length === 1 ? "" : "s"} ${issue.keys.map((key) => `"${key}"`).join(", ")}`
  const field = issue.path.join(".") || "record"
  if (issue.code === "invalid_type") return `${field} must be ${issue.expected}`
  return `${field}: ${issue.message}`
}

function validateSourceRecord(
  record: CircuitRecord,
  ctx: { records: CircuitRecord[]; recordIndex: number },
): void {
  const label = formatRecordLabel(record, ctx)
  if (record.type === "source_port") {
    const parsed = source_port.strict().safeParse(record)
    if (!parsed.success)
      throw new Error(
        parsed.error.issues
          .map((issue) => `${label}: ${formatValidationIssue(issue)}`)
          .join("\n"),
      )
    validatePinCapabilities(parsed.data, { pinLabel: label })
    return
  }
  let schema: z.ZodType<unknown> | undefined
  switch (record.type) {
    case "source_component":
      schema =
        record.ftype === "simple_chip"
          ? source_simple_chip
          : record.ftype === "simple_crystal"
            ? source_simple_crystal
            : source_component_base
      break
    case "source_trace":
      schema = source_trace
      break
    case "source_net":
      schema = source_net
      break
    case "source_component_internal_connection":
      schema = source_component_internal_connection
      break
  }
  if (!schema) return
  const parsed = schema.safeParse(record)
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .map((issue) => `${label}: ${formatValidationIssue(issue)}`)
        .join("\n"),
    )
}

/** Validate consumed source records without stripping unrelated render metadata. */
export function validateCircuitJson(circuitJson: CircuitJson): void {
  const parsed = circuitRecord.array().safeParse(circuitJson)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const recordIndex = issue?.path[0]
    throw new Error(
      typeof recordIndex === "number"
        ? `Circuit JSON record ${recordIndex + 1} must be an object with a string type`
        : "Circuit JSON must contain an array of records",
    )
  }
  for (const [recordIndex, record] of parsed.data.entries())
    validateSourceRecord(record, { records: parsed.data, recordIndex })
}
