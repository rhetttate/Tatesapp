// ---------------------------------------------------------------------------
// SCO bridge client (Web Bluetooth, two lanes)
//
// The self-checkout screen controls TWO NCR self-checkouts. Each lane has its
// own Pico W (firmware in /hardware/sco-bridge) plugged into the NCR's hand-
// scanner USB port, emulating a Zebra DS2208 in IBM Hand-Held USB mode. The
// tablet holds one Bluetooth connection per lane (advertised as "TatesSCO-1"
// and "TatesSCO-2") and sends codes that the Pico injects as scans.
//
// Unlike lib/posBridge.ts (single connection, fire-and-forget), this module:
//  - manages two independent connections keyed by lane (1 | 2)
//  - subscribes to the Pico's TX notifications, so the screen gets a live
//    feed: scan-ok / scan-fail acknowledgements and "host:<hex>" lines
//    showing whatever the NCR sends to the emulated scanner.
//
// Connections are module singletons — they survive in-app navigation, and are
// lost on a full page reload (reconnect is one tap per lane).
// ---------------------------------------------------------------------------

const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // central writes codes here
const NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // Pico notifies events here

export type Lane = 1 | 2;
export type LaneStatus = "connected" | "disconnected";
export type LaneEvent =
  | { kind: "scan-ok"; code: string }
  | { kind: "scan-fail"; code: string }
  | { kind: "host"; hex: string }
  | { kind: "pong"; name: string }
  | { kind: "raw"; text: string };

type Slot = {
  device: any;
  rxChar: any;
  onGattDisconnect: (() => void) | null;
};

const slots: Record<Lane, Slot> = {
  1: { device: null, rxChar: null, onGattDisconnect: null },
  2: { device: null, rxChar: null, onGattDisconnect: null },
};

const statusListeners = new Set<(lane: Lane, s: LaneStatus) => void>();
const eventListeners = new Set<(lane: Lane, e: LaneEvent) => void>();

function emitStatus(lane: Lane, s: LaneStatus) {
  statusListeners.forEach((cb) => {
    try {
      cb(lane, s);
    } catch {}
  });
}

function emitEvent(lane: Lane, e: LaneEvent) {
  eventListeners.forEach((cb) => {
    try {
      cb(lane, e);
    } catch {}
  });
}

export function onLaneStatus(cb: (lane: Lane, s: LaneStatus) => void): () => void {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

export function onLaneEvent(cb: (lane: Lane, e: LaneEvent) => void): () => void {
  eventListeners.add(cb);
  return () => eventListeners.delete(cb);
}

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

export function getLaneStatus(lane: Lane): LaneStatus {
  const s = slots[lane];
  return s.rxChar && s.device?.gatt?.connected ? "connected" : "disconnected";
}

export function getLaneDeviceName(lane: Lane): string {
  return (slots[lane].device?.name as string) || "";
}

function parseEvent(text: string): LaneEvent {
  if (text.startsWith("scan-ok:")) return { kind: "scan-ok", code: text.slice(8) };
  if (text.startsWith("scan-fail:")) return { kind: "scan-fail", code: text.slice(10) };
  if (text.startsWith("host:")) return { kind: "host", hex: text.slice(5) };
  if (text.startsWith("PONG ")) return { kind: "pong", name: text.slice(5) };
  return { kind: "raw", text };
}

/**
 * Pair / connect a lane to its Pico. MUST be called from a user gesture.
 * The device chooser filters on the "TatesSCO" name prefix; pick SCO-1 for
 * lane 1 and SCO-2 for lane 2 (a mixed-up pick still works — it just means
 * the codes land on the other self-checkout, so the UI shows the device name).
 */
export async function connectLane(lane: Lane): Promise<{ ok: boolean; message: string }> {
  if (!isBluetoothSupported()) {
    return {
      ok: false,
      message: "This browser can't use Bluetooth. Use Chrome on Android (iPads aren't supported).",
    };
  }

  const slot = slots[lane];
  try {
    const bt = (navigator as any).bluetooth;
    const device = await bt.requestDevice({
      filters: [{ namePrefix: "TatesSCO" }],
      optionalServices: [NUS_SERVICE],
    });

    if (slot.onGattDisconnect && slot.device) {
      slot.device.removeEventListener?.("gattserverdisconnected", slot.onGattDisconnect);
    }
    slot.device = device;
    slot.onGattDisconnect = () => {
      slot.rxChar = null;
      emitStatus(lane, "disconnected");
    };
    device.addEventListener("gattserverdisconnected", slot.onGattDisconnect);

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(NUS_SERVICE);
    slot.rxChar = await service.getCharacteristic(NUS_RX);

    // Event feed (best-effort — an older register-bridge Pico without TX
    // notifications would still work for sending).
    try {
      const txChar = await service.getCharacteristic(NUS_TX);
      await txChar.startNotifications();
      txChar.addEventListener("characteristicvaluechanged", (ev: any) => {
        try {
          const text = new TextDecoder().decode(ev.target.value);
          emitEvent(lane, parseEvent(text));
        } catch {}
      });
    } catch {}

    emitStatus(lane, "connected");
    return { ok: true, message: `Lane ${lane} linked to ${device.name || "SCO bridge"} ✅` };
  } catch (e: any) {
    slot.rxChar = null;
    const msg = e?.name === "NotFoundError" ? "No device selected." : (e?.message ?? String(e));
    return { ok: false, message: `Lane ${lane} connect failed: ` + msg };
  }
}

export function disconnectLane(lane: Lane) {
  const slot = slots[lane];
  try {
    slot.device?.gatt?.disconnect();
  } catch {}
  slot.rxChar = null;
  emitStatus(lane, "disconnected");
}

export type ScoSendResult = {
  ok: boolean;
  /** true when the code was written to the lane's bridge */
  delivered: boolean;
  message: string;
};

async function writeLine(lane: Lane, line: string): Promise<boolean> {
  const slot = slots[lane];
  if (getLaneStatus(lane) !== "connected") return false;
  const bytes = new TextEncoder().encode(line + "\n");
  if (slot.rxChar.writeValueWithoutResponse) {
    await slot.rxChar.writeValueWithoutResponse(bytes);
  } else {
    await slot.rxChar.writeValue(bytes);
  }
  return true;
}

/**
 * Send a code to a self-checkout as a scan. Unlike the register bridge, the
 * FULL code is sent (no check-digit stripping): the Pico emulates a scanner,
 * and a scanner reports the complete label. The firmware completes the check
 * digit itself for the 11-digit UPCs the app stores.
 */
export async function sendToLane(lane: Lane, rawCode: string): Promise<ScoSendResult> {
  const code = (rawCode || "").replace(/\D/g, "");
  if (!code) return { ok: false, delivered: false, message: "No code to send." };

  if (getLaneStatus(lane) !== "connected") {
    return { ok: true, delivered: false, message: `Lane ${lane} isn't linked — connect it first.` };
  }

  try {
    await writeLine(lane, code);
    return { ok: true, delivered: true, message: `Sent to lane ${lane} ✅` };
  } catch {
    return { ok: false, delivered: false, message: `Couldn't reach lane ${lane}'s bridge.` };
  }
}

/** Protocol-tuning escape hatch: send a raw 64-byte report as hex. */
export async function sendRawToLane(lane: Lane, hex: string): Promise<boolean> {
  try {
    return await writeLine(lane, "RAW:" + hex.replace(/[^0-9a-fA-F]/g, ""));
  } catch {
    return false;
  }
}

export async function pingLane(lane: Lane): Promise<boolean> {
  try {
    return await writeLine(lane, "PING");
  } catch {
    return false;
  }
}
