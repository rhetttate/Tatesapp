# ===========================================================================
# Tate's SCO Bridge — Raspberry Pi Pico W firmware (MicroPython)
#
# Emulates a Zebra DS2208 hand scanner in "IBM Hand-Held USB" mode
# (VID 05E0 / PID 1300, product "Symbol Bar Code Scanner") so an NCR
# self-checkout scanner port accepts it as a real auxiliary scanner.
#
# The attendant tablet sends a code over Bluetooth (Nordic UART Service);
# this firmware sends it to the NCR as an IBM hand-held "scanned data"
# HID report — as if the code had been scanned on the hand scanner.
#
# Unlike the register bridge (hardware/pos-bridge), this is NOT a keyboard:
# IBM Hand-Held USB is a point-of-sale HID protocol with 64-byte reports,
# raw digit payloads and symbology identifier bytes.
#
# Per-device config: change DEVICE_NAME + USB_SERIAL below (SCO-1 / SCO-2).
#
# MAINTENANCE MODE: this firmware disables the USB serial REPL for scanner
# fidelity. To get the REPL back (for mpremote/reflashing files): plug the
# Pico in and hold the BOOTSEL button during the first ~1.5 seconds of boot.
# The LED stays on solid and the Pico stays a normal serial device.
#
# Install deps first:  mpremote mip install usb-device-hid
# ===========================================================================

import struct
import time

import bluetooth
import machine
import rp2
from micropython import const

# --------------------------- per-device config ------------------------------
DEVICE_NAME = "TatesSCO-1"  # SCO-2 Pico: "TatesSCO-2"
# Serial string mimics the real unit's format (32 hex chars + ":1").
# Give each Pico a different value.
USB_SERIAL = "S/N:C4A15750138B2C54A932FAEE87947A01:1"

# IBM hand-held scan report tuning (see README "Protocol notes"):
# three bytes that sit between the length byte and the label data.
# VERIFIED 2026-08-13: captured verbatim from the store's real Symbol scanner
# in IBM hand-held mode (capture.py, three UPC-A scans).
SCAN_HDR = b"\x10\x03\x00"
# Numeric labels (UPC/EAN): the real unit sends ASCII "0"-"9" (verified in the
# same capture). True = raw byte values 0-9, kept only as a tuning fallback.
DIGITS_RAW = False

# --------------------------- maintenance escape ------------------------------
def _maintenance_requested():
    # Hold BOOTSEL just after plugging in to keep the normal serial REPL.
    try:
        deadline = time.ticks_add(time.ticks_ms(), 1500)
        while time.ticks_diff(deadline, time.ticks_ms()) > 0:
            if rp2.bootsel_button():
                return True
            time.sleep_ms(50)
    except Exception:
        pass
    return False


_led = machine.Pin("LED", machine.Pin.OUT)

if _maintenance_requested():
    _led.on()
    print("SCO bridge: maintenance mode — USB untouched, REPL available.")
    raise SystemExit

# --------------------------- USB scanner identity ----------------------------
import usb.device
from usb.device.hid import HIDInterface

_EP_IN_FLAG = const(0x80)

# Vendor-defined HID report descriptor: one 64-byte input report (scan data to
# the POS) + one 64-byte output report (POS commands: enable/disable/beep...).
# Usage page 0xFF45 / usage 0x4B00 match a real Symbol unit in IBM hand-held
# mode (probed with hidapi on the store's scanner).
_REPORT_DESC = bytes(
    [
        0x06, 0x45, 0xFF,  # Usage Page (Vendor Defined 0xFF45)
        0x0A, 0x00, 0x4B,  # Usage (0x4B00)
        0xA1, 0x01,        # Collection (Application)
        0x09, 0x02,        #   Usage (0x02)
        0x15, 0x00,        #   Logical Minimum (0)
        0x26, 0xFF, 0x00,  #   Logical Maximum (255)
        0x75, 0x08,        #   Report Size (8)
        0x95, 0x40,        #   Report Count (64)
        0x81, 0x02,        #   Input (Data, Var, Abs)
        0x09, 0x03,        #   Usage (0x03)
        0x15, 0x00,
        0x26, 0xFF, 0x00,
        0x75, 0x08,
        0x95, 0x40,
        0x91, 0x02,        #   Output (Data, Var, Abs)
        0xC0,              # End Collection
    ]
)

# Host->device traffic (interrupt OUT + SET_REPORT) is queued here by USB
# callbacks and drained by the main loop (never do work inside callbacks).
_host_cmds = []


class IBMHandHeldInterface(HIDInterface):
    # HIDInterface with the stock 8-byte IN endpoint replaced by the 64-byte
    # interrupt IN + interrupt OUT pair a real IBM hand-held scanner exposes.

    def __init__(self):
        super().__init__(
            _REPORT_DESC,
            set_report_buf=bytearray(64),
            protocol=0,
            interval_ms=1,
        )
        self._out_ep = None
        self._out_buf = bytearray(64)

    def desc_cfg(self, desc, itf_num, ep_num, strs):
        desc.interface(itf_num, 2, 0x03, 0x00, 0x00, 0)  # HID, no subclass/protocol
        self.get_hid_descriptor(desc)
        self._int_ep = (ep_num + 1) | _EP_IN_FLAG
        self._out_ep = ep_num
        desc.endpoint(self._int_ep, "interrupt", 64, self.interval_ms)
        desc.endpoint(self._out_ep, "interrupt", 64, self.interval_ms)
        self.idle_rate = 0
        self.protocol = 1

    def num_eps(self):
        return 2

    def on_open(self):
        super().on_open()
        self._listen_out()

    def _listen_out(self):
        try:
            self.submit_xfer(self._out_ep, self._out_buf, self._on_out)
        except Exception:
            pass

    def _on_out(self, ep_addr, result, xferred_bytes):
        # TinyUSB callback context — just queue and re-arm.
        if xferred_bytes:
            _host_cmds.append(bytes(self._out_buf[:xferred_bytes]))
        self._listen_out()

    def on_set_report(self, report_data, report_id, report_type):
        _host_cmds.append(bytes(report_data))
        return True


_scanner = IBMHandHeldInterface()
usb.device.get().init(
    _scanner,
    builtin_driver=False,  # no CDC serial — a real scanner is HID only
    # Strings/bcdDevice copied from a real Symbol scanner in IBM hand-held mode.
    manufacturer_str="Symbol Technologies, Inc, 2008",
    product_str="Symbol Bar Code Scanner::EA",
    serial_str=USB_SERIAL,
    id_vendor=0x05E0,
    id_product=0x1300,
    bcd_device=0x0004,
    max_power_ma=400,
)
time.sleep(1)  # let USB enumerate before bringing up Bluetooth (else BLE init fails)

# --------------------------- IBM hand-held reports ---------------------------
# Layout VERIFIED against the store's real scanner (UPC-A):
#   11 10 03 00 "071012107018" 0d   → [N][10 03 00][ASCII digits][sym]
#   N = 4 + len(digits) + 1 = count of meaningful bytes; 64-byte zero-padded.
# UPC-A goes out with its check digit (12 ASCII digits), symbology 0x0D.
# Other labels (Code 128):   [N][hdr x3][ascii...][0x00][sym][0x0B]
#   (Code 128 trailer still reconstructed from host-side reads, not captured.)
#
# Symbology identifier bytes:
_SYM_UPCE = const(10)
_SYM_EAN8 = const(12)
_SYM_UPCA = const(13)
_SYM_EAN13 = const(22)
_SYM_CODE128 = const(24)


def _upca_check_digit(d11):
    s = 0
    for i in range(11):
        n = ord(d11[i]) - 48
        s += n * 3 if i % 2 == 0 else n
    return chr(((10 - s % 10) % 10) + 48)


def build_scan_report(code):
    digits = "".join(ch for ch in code if "0" <= ch <= "9")
    rep = bytearray(64)

    if digits == code and len(digits) in (8, 11, 12, 13):
        # Numeric symbologies. 11 digits = UPC-A missing its check digit
        # (how the app stores them) — complete it, like a real scan would carry.
        if len(digits) == 11:
            digits += _upca_check_digit(digits)
        sym = {8: _SYM_EAN8, 12: _SYM_UPCA, 13: _SYM_EAN13}[len(digits)]
        if DIGITS_RAW:
            data = bytes(ord(ch) - 48 for ch in digits)
        else:
            data = digits.encode()
        n = 4 + len(data) + 1
        rep[0] = n
        rep[1:4] = SCAN_HDR
        rep[4 : 4 + len(data)] = data
        rep[n - 1] = sym
    else:
        # Anything else goes out as Code 128 ASCII (short PLUs, alphanumerics).
        data = code.encode()[:54]
        n = 4 + len(data) + 3
        rep[0] = n
        rep[1:4] = SCAN_HDR
        rep[4 : 4 + len(data)] = data
        rep[n - 2] = _SYM_CODE128
        rep[n - 1] = 0x0B
    return rep


# --------------------------- BLE Nordic UART Service --------------------------
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


def _adv_payload(name):
    payload = bytearray()
    payload += struct.pack("BB", 2, 0x01) + struct.pack("B", 0x06)  # flags
    nb = name.encode()
    payload += struct.pack("BB", len(nb) + 1, 0x09) + nb  # complete local name
    return payload


# Lines received over BLE are queued here and handled by the main loop.
_pending = []


class ScoBridge:
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
        print("Tate's SCO Bridge ready — advertising as", name)

    def _advertise(self):
        self._ble.gap_advertise(100_000, adv_data=self._payload)

    def _irq(self, event, data):
        # Keep this SHORT — no USB sends here. Just buffer + queue.
        if event == _IRQ_CENTRAL_CONNECT:
            conn, _, _ = data
            self._conns.add(conn)
        elif event == _IRQ_CENTRAL_DISCONNECT:
            conn, _, _ = data
            self._conns.discard(conn)
            self._buf = b""
            self._advertise()
        elif event == _IRQ_GATTS_WRITE:
            conn, handle = data
            if handle == self._rx:
                self._buf += self._ble.gatts_read(self._rx)
                while b"\n" in self._buf:
                    line, self._buf = self._buf.split(b"\n", 1)
                    line = line.strip()
                    if line:
                        _pending.append(line)

    def notify(self, text):
        data = text.encode() if isinstance(text, str) else text
        for conn in list(self._conns):
            try:
                self._ble.gatts_notify(conn, self._tx, data)
            except Exception:
                pass


bridge = ScoBridge()

_HEX = "0123456789abcdef"


def _hex(b):
    return "".join(_HEX[x >> 4] + _HEX[x & 0xF] for x in b)


def _unhex(s):
    return bytes(int(s[i : i + 2], 16) for i in range(0, len(s) - 1, 2))


def handle_line(line):
    # Tablet protocol:
    #   "<digits>"      scan the code (auto symbology)
    #   "RAW:<hex>"     send an arbitrary report, padded to 64 bytes
    #                   (protocol tuning on site without reflashing)
    #   "PING"          replies "PONG <name>"
    try:
        text = line.decode()
    except Exception:
        return
    if text == "PING":
        bridge.notify("PONG " + DEVICE_NAME)
        return
    if text.startswith("RAW:"):
        rep = bytearray(64)
        raw = _unhex(text[4:])[:64]
        rep[: len(raw)] = raw
    else:
        rep = build_scan_report(text)
    ok = _scanner.send_report(rep, timeout_ms=500)
    print("scan:", text, "->", "ok" if ok else "FAILED")
    bridge.notify(("scan-ok:" if ok else "scan-fail:") + text)


_last_blink = time.ticks_ms()

while True:
    if _pending:
        try:
            handle_line(_pending.pop(0))
        except Exception as e:
            print("loop error:", e)
    if _host_cmds:
        # Forward whatever the NCR sends us to the tablet for diagnosis.
        cmd = _host_cmds.pop(0)
        n = len(cmd)
        while n > 0 and cmd[n - 1] == 0:
            n -= 1
        print("host cmd:", _hex(cmd[:n]))
        bridge.notify("host:" + _hex(cmd[: max(n, 8)]))
    if time.ticks_diff(time.ticks_ms(), _last_blink) >= 500:  # heartbeat
        _led.toggle()
        _last_blink = time.ticks_ms()
    time.sleep_ms(20)
