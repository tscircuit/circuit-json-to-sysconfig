import type { Cc2340Options } from "../../lib/index"

// Explicit example firmware choices for the frozen v0.4.4 Circuit JSON.
// No interrupt is inferred from ACCEL_INT1's name. No display bus is configured.
export const pedometerOptions: Cc2340Options = {
  source_component_id: "source_component_25",
  gpios: [
    {
      source_port_id: "source_port_103",
      gpio_name: "CONFIG_DISPLAY_ISOLATE",
      direction: "output",
      initial_state: "high",
    },
    {
      source_port_id: "source_port_108",
      gpio_name: "CONFIG_PMIC_LP",
      direction: "output",
      initial_state: "low",
    },
    {
      source_port_id: "source_port_99",
      gpio_name: "CONFIG_ACCEL_INT",
      direction: "input",
      pull: "none",
      interrupt: "none",
    },
  ],
  i2c: {
    i2c_name: "CONFIG_I2C_0",
    sda_source_port_id: "source_port_97",
    scl_source_port_id: "source_port_113",
    max_bit_rate: 100000,
    peripheral_assignment: "suggested",
  },
  reserved_ports: [
    {
      source_port_id: "source_port_98",
      reason: "DISP_CS: display bus outside conversion scope",
    },
    { source_port_id: "source_port_100", reason: "DISP_MOSI: SPI unsupported" },
    {
      source_port_id: "source_port_104",
      reason: "DISP_DC: display behavior not established",
    },
    { source_port_id: "source_port_106", reason: "DISP_SCLK: SPI unsupported" },
    {
      source_port_id: "source_port_109",
      reason: "DISP_RST: display behavior not established",
    },
    { source_port_id: "source_port_101", reason: "SWDIO: debug ownership" },
    { source_port_id: "source_port_102", reason: "SWDCK: debug ownership" },
  ],
  firmware: { rtos: "nortos" },
}
