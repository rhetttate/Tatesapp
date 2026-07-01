// ---------------------------------------------------------------------------
// POS bridge client (Web Bluetooth)
//
// The NCR Encore is a sealed POS, so the tablet can't type into it directly.
// A Raspberry Pi Pico W (firmware in /hardware/pos-bridge) plugs into the NCR
// USB scanner port and acts as a USB keyboard. The tablet sends the tapped code
// to the Pico over Bluetooth (Nordic UART Service); the Pico types the digits +
// Enter into the register, exactly like the Zebra scanner.
//
// Why Bluetooth and not HTTP/Wi-Fi? The app is served over HTTPS, and browsers
// block an HTTPS page from reaching a local plain-HTTP device. Web Bluetooth is
// allowed from HTTPS, so that's the transport.
//
// The connection is held in this module (a singleton), so it survives in-app
// navigation between the register and the PLU page (which use client-side Link
// navigation). A full page reload drops it and you reconnect with one tap.
// ---------------------------------------------------------------------------

// Nordic UART Service UUIDs (must match the Pico firmware).
const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // central writes codes here

type BridgeStatus = "connected" | "disconnected";

let device: any = null;
let rxChar: any = null;
const listeners = new Set<(s: BridgeStatus) => void>();

function emit(s: BridgeStatus) {
  listeners.forEach((cb) => {
    try {
      cb(s);
    } catch {}
  });
}

export function onBridgeChange(cb: (s: BridgeStatus) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

export function getBridgeStatus(): BridgeStatus {
  return rxChar && device?.gatt?.connected ? "connected" : "disconnected";
}

export function isBridgeConnected(): boolean {
  return getBridgeStatus() === "connected";
}

export function getBridgeDeviceName(): string {
  return (device?.name as string) || "";
}

function onDisconnected() {
  rxChar = null;
  emit("disconnected");
}

/**
 * Pair / connect to the Pico bridge. MUST be called from a user gesture
 * (a button click) — the browser requires that for the device chooser.
 */
export async function connectBluetooth(): Promise<{ ok: boolean; message: string }> {
  if (!isBluetoothSupported()) {
    return {
      ok: false,
      message:
        "This browser can't use Bluetooth. Use Chrome on Android (iPads aren't supported).",
    };
  }

  try {
    const bt = (navigator as any).bluetooth;
    device = await bt.requestDevice({
      filters: [{ namePrefix: "Tates" }],
      optionalServices: [NUS_SERVICE],
    });

    device.removeEventListener?.("gattserverdisconnected", onDisconnected);
    device.addEventListener("gattserverdisconnected", onDisconnected);

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(NUS_SERVICE);
    rxChar = await service.getCharacteristic(NUS_RX);

    emit("connected");
    return { ok: true, message: `Connected to ${device.name || "POS bridge"} ✅` };
  } catch (e: any) {
    rxChar = null;
    const msg = e?.name === "NotFoundError" ? "No device selected." : (e?.message ?? String(e));
    return { ok: false, message: "Bluetooth connect failed: " + msg };
  }
}

export async function disconnectBluetooth() {
  try {
    device?.gatt?.disconnect();
  } catch {}
  rxChar = null;
  emit("disconnected");
}

export type PosSendResult = {
  ok: boolean;
  /** true when the bridge accepted the code and typed it into the POS */
  delivered: boolean;
  message: string;
};

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

/**
 * Send a code to the POS through the bridge. The Pico expects the digits
 * terminated by a newline. Never throws — returns a structured result so the
 * UI can fall back to an on-screen barcode when delivery isn't possible.
 */
export async function sendToPos(rawCode: string): Promise<PosSendResult> {
  const code = onlyDigits(rawCode);
  if (!code) return { ok: false, delivered: false, message: "No code to send." };

  if (!isBridgeConnected()) {
    return {
      ok: true,
      delivered: false,
      message: "POS bridge not connected — showing barcode to scan.",
    };
  }

  try {
    const bytes = new TextEncoder().encode(code + "\n");
    if (rxChar.writeValueWithoutResponse) {
      await rxChar.writeValueWithoutResponse(bytes);
    } else {
      await rxChar.writeValue(bytes);
    }
    return { ok: true, delivered: true, message: "Sent to register ✅" };
  } catch (e: any) {
    return {
      ok: false,
      delivered: false,
      message: "Couldn't reach POS bridge — showing barcode instead.",
    };
  }
}
