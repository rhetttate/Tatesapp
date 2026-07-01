# OPTIONAL — production hardening for the POS bridge.
#
# By default a CircuitPython device also shows up on the register as a USB drive
# ("CIRCUITPY") and a serial port. A real scanner is keyboard-only, so this file
# hides those, leaving just the keyboard. Cleaner and less likely to trip up the
# NCR terminal.
#
# Put this file next to code.py on the CIRCUITPY drive.
#
# ⚠️ Trade-off: once this is active you can no longer edit code.py by dragging
# files. To make changes again, hold the Pico's BOOTSEL button while plugging it
# into your computer (that re-flashes / re-enables the drive). Only add this once
# everything works.

import usb_cdc
import usb_hid
import storage

# Keep the keyboard...
usb_hid.enable((usb_hid.Devices.KEYBOARD,))

# ...hide the data drive + serial from the register.
storage.disable_usb_drive()
usb_cdc.disable()
