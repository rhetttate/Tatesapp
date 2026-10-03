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
// Connections are module singletons — they survive in-app navigation. After a
// full page reload, restoreLanes() re-links each lane to its Pico on its own.
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
  /** true after an intentional unlink — suppresses auto-relink */
  manual: boolean;
  retrying: boolean;
};

const slots: Record<Lane, Slot> = {
  1: { device: null, rxChar: null, onGattDisconnect: null, manual: false, retrying: false },
  2: { device: null, rxChar: null, onGattDisconnect: null, manual: false, retrying: false },
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
 * Resolve once the device is heard advertising (or after timeoutMs). After a
 * page reload Chrome often refuses gatt.connect() on a remembered device until
 * it has seen an advertisement from it, so we listen for one first.
 */
async function waitForAdvertisement(device: any, timeoutMs: number) {
  if (!device?.watchAdvertisements) return;
  const ac = new AbortController();
  try {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      device.addEventListener(
        "advertisementreceived",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true }
      );
      device.watchAdvertisements({ signal: ac.signal }).catch(() => {
        clearTimeout(t);
        resolve();
      });
    });
  } finally {
    ac.abort();
  }
}

/** Open GATT + characteristics on the slot's already-chosen device. */
async function setupGatt(lane: Lane, slot: Slot) {
  if (!slot.device.gatt.connected) await waitForAdvertisement(slot.device, 4000);
  const server = await slot.device.gatt.connect();
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
}

function adoptDevice(lane: Lane, device: any) {
  const slot = slots[lane];
  if (slot.onGattDisconnect && slot.device) {
    slot.device.removeEventListener?.("gattserverdisconnected", slot.onGattDisconnect);
  }
  slot.device = device;
  slot.onGattDisconnect = () => {
    slot.rxChar = null;
    emitStatus(lane, "disconnected");
    autoRelink(lane);
  };
  device.addEventListener("gattserverdisconnected", slot.onGattDisconnect);
  try {
    localStorage.setItem(`sco_lane_${lane}_device`, device.id);
  } catch {}
}

/**
 * Quietly re-establish a dropped connection (Pico power blip, tablet moved
 * out of range). The browser already knows the device, so no chooser is
 * needed. Keeps retrying (backing off to every 12s) until it works or the
 * user unlinks manually.
 */
async function autoRelink(lane: Lane, firstDelayMs = 1000) {
  const slot = slots[lane];
  if (slot.retrying || slot.manual || !slot.device) return;
  slot.retrying = true;
  try {
    for (let attempt = 0; ; attempt++) {
      const wait = attempt === 0 ? firstDelayMs : Math.min(12000, 1000 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, wait));
      if (slot.manual || !slot.device) break;
      if (slot.device?.gatt?.connected && slot.rxChar) break;
      try {
        await setupGatt(lane, slot);
        emitStatus(lane, "connected");
        emitEvent(lane, { kind: "raw", text: "auto-relinked ✅" });
        break;
      } catch {}
    }
  } finally {
    slot.retrying = false;
  }
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
  slot.manual = false;
  try {
    const bt = (navigator as any).bluetooth;
    const device = await bt.requestDevice({
      filters: [{ namePrefix: "TatesSCO" }],
      optionalServices: [NUS_SERVICE],
    });
    adoptDevice(lane, device);

    await setupGatt(lane, slot);

    emitStatus(lane, "connected");
    return { ok: true, message: `Lane ${lane} linked to ${device.name || "SCO bridge"} ✅` };
  } catch (e: any) {
    slot.rxChar = null;
    const msg = e?.name === "NotFoundError" ? "No device selected." : (e?.message ?? String(e));
    return { ok: false, message: `Lane ${lane} connect failed: ` + msg };
  }
}

let restoreStarted = false;

/**
 * Re-link both lanes to the Picos this tablet paired with before, after a page
 * reload or app relaunch — no chooser and no tap. Each lane goes back to the
 * device it was last linked to (falling back to the TatesSCO-1 / -2 name).
 * Only the first call does anything. Needs Chrome's getDevices() (remembered
 * Bluetooth permissions); where it's missing this is a no-op.
 */
export async function restoreLanes() {
  if (restoreStarted || !isBluetoothSupported()) return;
  restoreStarted = true;

  const bt = (navigator as any).bluetooth;
  if (!bt.getDevices) return;

  // Retry when the tablet wakes up / the app comes back to the front.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    ([1, 2] as Lane[]).forEach((l) => {
      if (getLaneStatus(l) !== "connected") autoRelink(l, 0);
    });
  });

  try {
    const known: any[] = (await bt.getDevices()).filter((d: any) =>
      (d.name || "").startsWith("TatesSCO")
    );
    for (const lane of [1, 2] as Lane[]) {
      if (slots[lane].device) continue;
      let savedId = "";
      try {
        savedId = localStorage.getItem(`sco_lane_${lane}_device`) || "";
      } catch {}
      const d =
        known.find((x) => x.id === savedId) ||
        known.find((x) => (x.name || "").endsWith(`-${lane}`));
      if (!d) continue;
      adoptDevice(lane, d);
      autoRelink(lane, 0);
    }
  } catch {}
}

export function disconnectLane(lane: Lane) {
  const slot = slots[lane];
  slot.manual = true;
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
