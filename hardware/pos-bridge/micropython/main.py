# ===========================================================================
# Tate's POS Bridge — Raspberry Pi Pico W firmware (MicroPython)
#
# The Pico W plugs into the NCR Encore's USB scanner port and acts as a USB
# keyboard. The cashier tablet sends a code over Bluetooth (Nordic UART Service,
# advertised as "TatesPOSBridge"); this types the digits + Enter into the POS,
# exactly like the Zebra scanner.
#
# Runs on MicroPython (Pico W has Bluetooth in MicroPython; CircuitPython does
# not). Requires the usb-device-keyboard library in /lib (installed via mip).
# Copy this file to the device as main.py so it runs on boot.
# ===========================================================================

import struct
import time
import bluetooth
import usb.device
from usb.device.keyboard import KeyboardInterface, KeyCode
from micropython import const

DEVICE_NAME = "TatesPOSBridge"

# --- USB keyboard into the POS ------------------------------------------------
_kbd = KeyboardInterface()
usb.device.get().init(_kbd, builtin_driver=True)  # builtin_driver keeps the REPL/serial
time.sleep(1)  # let USB finish re-enumerating before bringing up Bluetooth (else BLE init fails)

_DIGITS = {
    "0": KeyCode.N0, "1": KeyCode.N1, "2": KeyCode.N2, "3": KeyCode.N3, "4": KeyCode.N4,
    "5": KeyCode.N5, "6": KeyCode.N6, "7": KeyCode.N7, "8": KeyCode.N8, "9": KeyCode.N9,
}

# Key pressed after the digits. Most POS want ENTER (like a scanner). If your
# NCR needs Tab instead, change to KeyCode.TAB.
_TERMINATOR = KeyCode.ENTER


def type_code(code):
    try:
        for ch in code:
            kc = _DIGITS.get(ch)
            if kc is None:
                continue
            _kbd.send_keys([kc]); time.sleep_ms(8)
            _kbd.send_keys([]);   time.sleep_ms(8)
        _kbd.send_keys([_TERMINATOR]); time.sleep_ms(8)
        _kbd.send_keys([])
    except Exception as e:
        print("type_code error:", e)


# --- BLE advertising payload (name only; fits the 31-byte budget) -------------
def _adv_payload(name):
    payload = bytearray()
    # Flags: general discoverable, BR/EDR not supported
    payload += struct.pack("BB", 2, 0x01) + struct.pack("B", 0x06)
    nb = name.encode()
    payload += struct.pack("BB", len(nb) + 1, 0x09) + nb  # complete local name
    return payload


# --- BLE Nordic UART Service --------------------------------------------------
_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)

_UART_UUID = bluetooth.UUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
_UART_TX = (bluetooth.UUID("6E400003-B5A3-F393-E0A9-E50E24DCCA9E"), bluetooth.FLAG_NOTIFY)
_UART_RX = (
    bluetooth.UUID("6E400002-B5A3-F393-E0A9-E50E24DCCA9E"),
    bluetooth.FLAG_WRITE | bluetooth.FLAG_WRITE_NO_RESPONSE,
)
_UART_SERVICE = (_UART_UUID, (_UART_TX, _UART_RX))


class PosBridge:
    def __init__(self, name=DEVICE_NAME):
        self._ble = bluetooth.BLE()
        self._ble.active(True)
        self._ble.config(gap_name=name)
        self._ble.irq(self._irq)
        ((self._tx, self._rx),) = self._ble.gatts_register_services((_UART_SERVICE,))
        self._conns = set()
        self._buf = b""
        self._payload = _adv_payload(name)
        self._advertise()
        print("Tate's POS Bridge ready — advertising as", name)

    def _advertise(self):
        self._ble.gap_advertise(100_000, adv_data=self._payload)

    def _irq(self, event, data):
        if event == _IRQ_CENTRAL_CONNECT:
            conn, _, _ = data
            self._conns.add(conn)
            print("tablet connected")
        elif event == _IRQ_CENTRAL_DISCONNECT:
            conn, _, _ = data
            self._conns.discard(conn)
            self._buf = b""
            print("tablet disconnected")
            self._advertise()
        elif event == _IRQ_GATTS_WRITE:
            conn, handle = data
            if handle == self._rx:
                self._buf += self._ble.gatts_read(self._rx)
                while b"\n" in self._buf:
                    line, self._buf = self._buf.split(b"\n", 1)
                    line = line.strip()
                    if line:
                        print("ring:", line)
                        type_code(line.decode())


bridge = PosBridge()

while True:
    time.sleep_ms(200)
