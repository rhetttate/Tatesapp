# Tate's POS Bridge (hardware)

This is the little device that lets the tablet **tap an item and have it ring up
on the NCR Encore register** — no scanning. Because the NCR terminal is a sealed
POS you can't install software on, a tiny key‑emulator does the job instead.

## How it works

```
 Tablet (PLU lookup / Sale tap)
        │  Bluetooth (works from the HTTPS app)
        ▼
 Raspberry Pi Pico W  ──USB──►  NCR Encore terminal (sees a "keyboard")
   (this firmware: types digits + Enter, exactly like the Zebra scanner)
```

- **Tablet → Pico:** Bluetooth (Web Bluetooth). We use Bluetooth because the app
  runs over HTTPS, and browsers block an HTTPS page from reaching a local
  HTTP device. Bluetooth is allowed from HTTPS.
- **Pico → NCR:** USB. The Pico presents itself as a standard USB keyboard. When
  it receives a code it "types" the digits and presses Enter — identical to how
  your handheld scanner already feeds the register.

## Parts (~$10)

- **Raspberry Pi Pico W** or **Pico 2 W** (the *W* matters — it has Bluetooth)
- A USB cable that fits the NCR terminal's scanner/USB port (usually USB‑A → micro‑USB)

## Flashing (one time, ~10 minutes)

1. Install **CircuitPython** on the Pico W:
   - Hold the **BOOTSEL** button while plugging the Pico into your computer.
   - It appears as a USB drive named `RPI-RP2`.
   - Download the Pico W CircuitPython `.uf2` from <https://circuitpython.org/board/raspberry_pi_pico_w/>
     and drag it onto the drive. The Pico reboots and now shows as `CIRCUITPY`.
2. Add the libraries:
   - Download the CircuitPython **Library Bundle** from <https://circuitpython.org/libraries>.
   - Copy these folders into the `CIRCUITPY/lib/` folder:
     - `adafruit_hid`
     - `adafruit_ble`
3. Copy **`code.py`** (next to this README) onto the root of the `CIRCUITPY` drive.
4. Done. The Pico restarts and begins advertising as **`TatesPOSBridge`**.

## Using it

1. Plug the Pico into the NCR terminal's USB port (where a USB scanner would go).
2. On the tablet, open **PLU Lookup → Setup → "Connect to register"** and pick
   **TatesPOSBridge** from the Bluetooth chooser (one‑time pairing per session).
   - Must be **Chrome on Android** (iPads don't support Web Bluetooth).
   - The badge turns to **"Register linked"** when connected.
3. Tap any PLU or Sale item → the Pico types the code + Enter into the register.

The link is shared across the register and PLU pages while the app stays open
(navigate with the in‑app buttons, not a full browser refresh). If you reload the
page, just tap **Connect to register** again.

> **Fallback (always on):** if the bridge isn't linked, every tap still shows a
> **big barcode on the tablet** your existing scanner can read off the screen —
> so nothing breaks if the Pico is unplugged or Bluetooth drops.

## Optional: hide the USB drive (after it all works)

By default the Pico also appears as a "CIRCUITPY" USB drive on the register. To
present as keyboard‑only (like a real scanner), also copy **`boot.py`** (next to
this file) onto the Pico. See the note inside it — you'll need the BOOTSEL button
to make code changes afterward, so do this last.

## Testing the Pico by itself

Open any text editor on a computer, plug the Pico in, connect to it from a
Bluetooth test app (e.g. "nRF Connect"), and write `4011\n` to the Nordic UART
RX characteristic. You should see `4011` typed followed by Enter.
