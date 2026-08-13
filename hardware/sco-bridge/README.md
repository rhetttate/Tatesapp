# Tate's SCO Bridge — self-checkout scanner emulator

Two Pico Ws, one per self-checkout lane. Each plugs into the NCR's hand-scanner
USB port and pretends to be a **Zebra DS2208 in "IBM Hand-Held USB" mode**
(`VID 05E0 / PID 1300`, product string `Symbol Bar Code Scanner`) — the same
identity a real DS2208 presents after scanning Zebra's "IBM Hand-Held USB"
config barcode. The attendant tablet (the `/cashier/sco` screen) talks to both
Picos over Bluetooth and injects codes as if they'd been scanned.

This is **not** the same trick as the register bridge in `../pos-bridge`
(a USB keyboard). IBM Hand-Held USB is a point-of-sale HID protocol:
64-byte reports, digit payloads, symbology identifier bytes, and the POS can
send commands *to* the scanner (enable/disable/beep). The firmware forwards
everything the NCR sends back to the tablet (`host:<hex>` notifications), so
you can see the NCR talking to it live.

## Flash a Pico (do this twice)

1. Flash MicroPython (same UF2 as the register bridges — already on them if
   you're re-purposing one; otherwise BOOTSEL-drag the Pico W UF2).
2. Install the USB HID library:
   ```
   mpremote connect COMx resume mip install usb-device-hid
   ```
3. Edit the two config lines at the top of `main.py` per device:
   - Pico A: `DEVICE_NAME = "TatesSCO-1"`, leave `USB_SERIAL` as-is
   - Pico B: `DEVICE_NAME = "TatesSCO-2"`, change the last digits of `USB_SERIAL`
4. Copy it on:
   ```
   mpremote connect COMx resume fs cp main.py :main.py
   ```
   ⚠️ If you generate a per-device `main.py` via PowerShell, write it
   **without a UTF-8 BOM** (`Set-Content -Encoding utf8` adds one and MicroPython
   then dies with SyntaxError). Use:
   `[System.IO.File]::WriteAllText($p, $c, (New-Object System.Text.UTF8Encoding($false)))`
5. Reboot (`mpremote connect COMx resume exec "import machine; machine.reset()"`).

## ⚠️ The USB serial REPL is OFF while running

A real scanner is HID-only, so the firmware disables the CDC serial port —
`mpremote` won't see the Pico while it's being a scanner. To get the REPL back:
unplug, replug, and **hold BOOTSEL during the first ~1.5 s after power-on**
(after the boot, not before — holding it *while* plugging in gives you the UF2
bootloader drive instead). LED solid = maintenance mode, serial REPL available.

Normal running state: LED blinks ~1×/second.

## Test on a PC before the store

Plug the flashed Pico into a PC, then:

```
pip install hidapi
python capture.py
```

Connect the tablet screen to the Pico (it advertises `TatesSCO-1/2`), tap an
item, and you should see 64-byte reports print with the decoded digits.

`capture.py` has a second job: plug in the store's **real Zebra scanner**
switched to IBM Hand-Held USB mode and scan real products — the printed bytes
are the ground truth. If they differ from what the Pico sends (header bytes,
digit encoding), adjust `SCAN_HDR` / `DIGITS_RAW` in `main.py`. Set the Zebra
back to "HID Keyboard" mode afterwards or the register stops ringing!

## Protocol notes (what's solid, what's tunable)

Verified against the store's own Zebra (capture.py, 2026-08-13):
- Identity: `VID 05E0 / PID 1300`, manufacturer `Symbol Technologies, Inc, 2008`,
  product `Symbol Bar Code Scanner::EA`, bcdDevice `0x0004`, report descriptor
  usage page `0xFF45` usage `0x4B00` — all mirrored by the firmware.
- UPC-A scan report: `11 10 03 00 <12 ASCII digits> 0d` zero-padded to 64 —
  i.e. `[len][10 03 00][digits incl. check digit][symbology]`, UPC-A=13.

Best-effort (tunable without reflashing if the NCR is picky):
- Symbology ids for codes not yet captured (EAN-13=22, EAN-8=12, UPC-E=10,
  Code 128=24) and the Code 128 trailer come from host-side reads of real
  Symbol units (pteich/usbsymbolreader), not our own capture.
- The tablet can send `RAW:<hex>` over BLE to transmit any hand-crafted
  64-byte report — use this on site to bisect a format problem, then bake the
  fix into `build_scan_report()`.
- The NCR may send an "enable scanner" command before it accepts scans; the
  firmware currently accepts-and-ignores commands but shows them on the tablet
  (`host:<hex>` lines in the screen's activity feed). If injection only works
  after the real scanner would have been enabled, we'll teach the firmware to
  answer those commands — the feed tells us exactly what to answer.

## BLE protocol (tablet ⇄ Pico)

Nordic UART Service, same UUIDs as the register bridge. Newline-terminated:

| Tablet sends      | Pico does                                            |
|-------------------|------------------------------------------------------|
| `<code>\n`        | sends it as a scan (auto symbology; 11-digit UPCs get their check digit computed) |
| `RAW:<hex>\n`     | sends the raw report, zero-padded to 64 bytes        |
| `PING\n`          | notifies back `PONG <name>`                          |

Pico notifies: `scan-ok:<code>`, `scan-fail:<code>`, `host:<hex>`, `PONG <name>`.
