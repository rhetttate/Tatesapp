# ===========================================================================
# Tate's POS Bridge — Raspberry Pi Pico W firmware (CircuitPython)
#
# Turns a ~$6 Pico W into a USB keyboard that plugs into the NCR Encore
# terminal's USB scanner port. The cashier tablet sends a code over Bluetooth
# (BLE Nordic UART Service); this device then "types" the digits + Enter into
# the POS, exactly like a Zebra scanner would.
#
# Why Bluetooth and not Wi-Fi/HTTP? The tablet app is served over HTTPS, and
# browsers block an HTTPS page from talking to a local plain-HTTP device
# (mixed content). Web Bluetooth, however, IS allowed from HTTPS. So the
# tablet -> device link is BLE; the device -> POS link is USB HID.
#
# Flash steps are in README.md.
# ===========================================================================

import time
import usb_hid
from adafruit_hid.keyboard import Keyboard
from adafruit_hid.keycode import Keycode

from adafruit_ble import BLERadio
from adafruit_ble.advertising.standard import ProvideServicesAdvertisement
from adafruit_ble.services.nordic import UARTService

# --- USB keyboard into the POS -------------------------------------------------
kbd = Keyboard(usb_hid.devices)

DIGITS = {
    "0": Keycode.ZERO, "1": Keycode.ONE, "2": Keycode.TWO, "3": Keycode.THREE,
    "4": Keycode.FOUR, "5": Keycode.FIVE, "6": Keycode.SIX, "7": Keycode.SEVEN,
    "8": Keycode.EIGHT, "9": Keycode.NINE,
}


def type_code(code):
    """Type the digits, then press Enter — same as a scanner's keyboard wedge."""
    for ch in code:
        kc = DIGITS.get(ch)
        if kc is None:
            continue  # ignore anything that isn't a digit
        kbd.press(kc)
        kbd.release_all()
        time.sleep(0.012)  # small gap so the POS keyboard buffer keeps up
    kbd.press(Keycode.ENTER)
    kbd.release_all()


# --- BLE link to the tablet ----------------------------------------------------
ble = BLERadio()
ble.name = "TatesPOSBridge"
uart = UARTService()
advertisement = ProvideServicesAdvertisement(uart)

# Codes arrive newline-terminated: "4011\n". We buffer until we see the newline.
buffer = ""

print("Tate's POS Bridge ready. Advertising as 'TatesPOSBridge'...")

while True:
    ble.start_advertising(advertisement)
    while not ble.connected:
        time.sleep(0.1)

    print("Tablet connected.")
    ble.stop_advertising()

    while ble.connected:
        waiting = uart.in_waiting
        if waiting:
            chunk = uart.read(waiting)
            if chunk:
                try:
                    buffer += chunk.decode("utf-8")
                except Exception:
                    buffer = ""
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if line:
                        print("Ring:", line)
                        type_code(line)
        time.sleep(0.02)

    print("Tablet disconnected.")
    buffer = ""
