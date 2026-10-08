import type { SourcePort } from "circuit-json"

const pinCapabilities = [
  ["is_using_internal_pullup", "can_use_internal_pullup", "internal pull-up"],
  [
    "is_using_internal_pulldown",
    "can_use_internal_pulldown",
    "internal pull-down",
  ],
  ["is_using_open_drain", "can_use_open_drain", "open-drain output"],
  ["is_using_push_pull", "can_use_push_pull", "push-pull output"],
  ["is_using_tri_state", "can_use_tri_state", "tri-state output"],
  [
    "is_using_open_collector",
    "can_use_open_collector",
    "open-collector output",
  ],
  ["is_using_open_emitter", "can_use_open_emitter", "open-emitter output"],
  ["is_configured_for_i2c_sda", "supports_i2c_sda", "I2C SDA"],
  ["is_configured_for_i2c_scl", "supports_i2c_scl", "I2C SCL"],
  ["is_configured_for_spi_mosi", "supports_spi_mosi", "SPI MOSI"],
  ["is_configured_for_spi_miso", "supports_spi_miso", "SPI MISO"],
  ["is_configured_for_spi_sck", "supports_spi_sck", "SPI SCK"],
  ["is_configured_for_spi_cs", "supports_spi_cs", "SPI CS"],
  ["is_configured_for_uart_tx", "supports_uart_tx", "UART TX"],
  ["is_configured_for_uart_rx", "supports_uart_rx", "UART RX"],
] as const satisfies readonly (readonly [
  keyof SourcePort,
  keyof SourcePort,
  string,
])[]

export type SelectedPinAttribute = (typeof pinCapabilities)[number][0]

/** An omitted capability is unknown, while explicit false prohibits the mode. */
export function validatePinCapabilities(
  port: SourcePort,
  ctx: {
    pinLabel: string
    selectedAttributes?: readonly SelectedPinAttribute[]
  },
): void {
  for (const [
    selectedAttribute,
    capabilityAttribute,
    modeLabel,
  ] of pinCapabilities) {
    if (
      port[capabilityAttribute] === false &&
      (port[selectedAttribute] === true ||
        ctx.selectedAttributes?.includes(selectedAttribute))
    ) {
      throw new Error(`${ctx.pinLabel}: ${modeLabel} is not supported`)
    }
  }
}
