# Tate's POS Bridge (hardware)

The little device that lets the tablet **tap an item and have it ring up on the
NCR Encore register** — no scanning. Because the NCR is a sealed POS you can't
install software on, this tiny key‑emulator does the job instead.

## How it works

```
 Tablet (PLU lookup / Sale tap)
        │  Bluetooth (works from the HTTPS app)
        ▼
 Raspberry Pi Pico W  ──USB──►  NCR Encore terminal (sees a "keyboard")
   types the digits + Enter, exactly like the Zebra scanner
```

- **Tablet → Pico:** Bluetooth (Web Bluetooth). We use Bluetooth because the app
  runs over HTTPS, and browsers block an HTTPS page from reaching a local HTTP
  device. Bluetooth is allowed from HTTPS. (Android Chrome only — iPads can't.)
- **Pico → NCR:** USB. The Pico is a USB keyboard; on a Bluetooth message it
  types the digits and presses Enter.

## ⚠️ Pico W runs MicroPython here, not CircuitPython

The Raspberry Pi Pico W's Bluetooth is **only available under MicroPython** —
CircuitPython on the Pico W is Wi‑Fi‑only (`BLERadio()` fails with
"No adapter available"). So the working firmware for the Pico W is
[`micropython/main.py`](micropython/main.py).

(The CircuitPython files [`code.py`](code.py) / [`boot.py`](boot.py) are kept only
as an alternative for **nRF52840** boards, which do BLE + USB‑HID in CircuitPython.)

## Flashing a Pico W (already done on the current unit)

1. **MicroPython firmware:** hold **BOOTSEL**, plug the Pico into a computer,
   drag the Pico W `.uf2` from <https://micropython.org/download/RPI_PICO_W/> onto
   the `RPI-RP2` drive. It reboots as a MicroPython serial device (no drive).
2. **Install the USB keyboard library** (needs `mpremote`: `pip install mpremote`):
   ```
   mpremote connect <PORT> mip install usb-device-keyboard
   ```
3. **Copy the firmware** so it runs on boot:
   ```
   mpremote connect <PORT> fs cp micropython/main.py :main.py
   mpremote connect <PORT> reset
   ```
   It starts advertising as **TatesPOSBridge**.

## Using it

1. Plug the Pico into the NCR terminal's USB scanner port.
2. On the Android tablet (Chrome): **PLU Lookup → Setup → Connect to register →
   TatesPOSBridge.** Badge turns to **"Register linked."**
3. Tap any PLU or Sale item → the code types into the register.

The link is shared across the register and PLU pages while the app stays open
(navigate with the in‑app buttons, not a full refresh). Reload = tap Connect again.

> **Fallback (always on):** if the bridge isn't linked, every tap still shows a
> **big barcode on the tablet** your existing scanner can read off the screen.

## If NCR needs a different key ending

Some registers want **Tab** or nothing instead of **Enter** after the digits.
Change `_TERMINATOR` near the top of `micropython/main.py` (e.g. `KeyCode.TAB`),
then re-copy it with `mpremote ... fs cp micropython/main.py :main.py`.
