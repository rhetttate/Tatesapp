"""
IBM Hand-Held USB report capture / test tool (runs on the PC, not the Pico).

Two uses:

1. VERIFY THE PROTOCOL against a real scanner: set the store's Zebra scanner
   to "IBM Hand-Held USB" mode (scan the barcode in its Product Reference
   Guide), plug it into this PC, run this script, scan a few known products.
   The raw report bytes print in hex — compare them against what
   build_scan_report() in main.py produces and adjust SCAN_HDR / DIGITS_RAW
   if they differ. Remember to set the scanner back to HID Keyboard mode!

2. TEST THE PICO before plugging it into the NCR: plug a flashed SCO-bridge
   Pico into this PC, run this script, send codes from the tablet screen,
   and confirm the reports look right.

Requires:  pip install hidapi
"""

import sys
import time

try:
    import hid
except ImportError:
    sys.exit("Missing dependency — run:  pip install hidapi")

VID = 0x05E0  # Symbol / Zebra
PID = 0x1300  # IBM Hand-Held USB


def fmt(data):
    n = data[0] if data else 0
    hexes = " ".join(f"{b:02x}" for b in data)
    # Decode a numeric label per the layout main.py uses, as a sanity check.
    guess = ""
    if 6 <= n <= len(data):
        body = data[4 : n - 1]
        sym = data[n - 1]
        if all(b <= 9 for b in body):
            guess = f"  -> digits={''.join(str(b) for b in body)} sym={sym}"
        elif all(0x20 <= b < 0x7F for b in body):
            guess = f"  -> ascii={bytes(body).decode()} sym={sym}"
    return f"[{len(data):3d} bytes] {hexes}{guess}"


def main():
    print(f"Waiting for a device {VID:04x}:{PID:04x} (IBM Hand-Held USB)...")
    dev = None
    while dev is None:
        for info in hid.enumerate(VID, PID):
            dev = hid.device()
            dev.open_path(info["path"])
            print(
                f"Opened: {info.get('manufacturer_string')} / "
                f"{info.get('product_string')} / {info.get('serial_number')}"
            )
            break
        else:
            time.sleep(1)

    print("Scan something (Ctrl+C to quit)...\n")
    try:
        while True:
            data = dev.read(64, timeout_ms=500)
            if data:
                print(fmt(bytes(data)))
    except KeyboardInterrupt:
        pass
    finally:
        dev.close()


if __name__ == "__main__":
    main()
