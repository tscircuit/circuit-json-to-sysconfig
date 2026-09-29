interface PinmuxEntry {
  domain: "main" | "mcu"
  devicePin: string
  muxMode: number
}

/** Reads only the two arrays emitted by the pinned AM243x pinmux template. */
export function readPinmuxEntries(source: string): PinmuxEntry[] {
  const uncommented = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\r\n]*/g, "")
  const arrays = [
    ...uncommented.matchAll(
      /static\s+Pinmux_PerCfg_t\s+(\w+)\s*\[\s*\]\s*=\s*\{([\s\S]*?)\};/g,
    ),
  ]
  if (
    arrays.length !== 2 ||
    [...uncommented.matchAll(/\bPinmux_PerCfg_t\b/g)].length !== 2
  ) {
    throw new Error(
      "Unrecognized pinmux arrays; expected main and MCU initializers",
    )
  }
  const entries: PinmuxEntry[] = []
  const domains = new Set<string>()
  const reservedPins = new Set<string>()
  for (const array of arrays) {
    const domain =
      array[1] === "gPinMuxMainDomainCfg"
        ? "main"
        : array[1] === "gPinMuxMcuDomainCfg"
          ? "mcu"
          : undefined
    if (!domain || domains.has(domain))
      throw new Error(`Unrecognized or duplicate pinmux array ${array[1]}`)
    domains.add(domain)
    let remaining = array[2] ?? ""
    // A terminator is required and must be last. Everything before it must be consumed.
    while (
      !/^\s*\{\s*PINMUX_END\s*,\s*PINMUX_END\s*\}\s*,?\s*$/.test(remaining)
    ) {
      const entry = remaining.match(
        /^\s*\{\s*(PIN_[A-Z0-9_]+)\s*,\s*\(\s*PIN_MODE\(([0-9]+)\)\s*(?:\|\s*PIN_(?:INPUT_ENABLE|PULL_DIRECTION|PULL_DISABLE)\s*)*\)\s*\}\s*,/,
      )
      if (!entry?.[1] || !entry[2])
        throw new Error(`Unrecognized pinmux initializer in ${array[1]}`)
      const devicePin = entry[1]
      if (reservedPins.has(devicePin))
        throw new Error(`Duplicate pinmux reservation: ${devicePin}`)
      reservedPins.add(devicePin)
      entries.push({ domain, devicePin, muxMode: Number(entry[2]) })
      remaining = remaining.slice(entry[0].length)
    }
  }
  return entries
}
