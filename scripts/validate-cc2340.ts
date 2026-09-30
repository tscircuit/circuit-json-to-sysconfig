import { validateCc2340 } from "./validate-cc2340-runner"

try {
  await validateCc2340(process.env)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
