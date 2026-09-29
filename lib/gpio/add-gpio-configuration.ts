import type { SysConfig } from "sysconfigts"
import type { ResolvedGpioRequest } from "./resolve-gpio-request"

export function addGpioConfiguration(
  config: SysConfig,
  request: ResolvedGpioRequest,
) {
  config.addModule({
    name: "gpio",
    modulePath: "/drivers/gpio/gpio",
    arguments: [{}, false],
  })
  config.addInstance({ name: "gpio1", moduleName: "gpio" })
  config.setValue("gpio1.$name", request.gpio_name)
  config.setValue("gpio1.pinDir", request.direction.toUpperCase())
  config.setValue("gpio1.useMcuDomainPeripherals", true)
  config.setValue("gpio1.MCU_GPIO.$assign", request.gpioPin.peripheral)
  config.setValue("gpio1.MCU_GPIO.gpioPin.$assign", request.gpioPin.ball)
}
