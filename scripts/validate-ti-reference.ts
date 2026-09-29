import { validateTiReference } from "./validate-ti-reference-runner"

try {
  await validateTiReference(process.env)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
