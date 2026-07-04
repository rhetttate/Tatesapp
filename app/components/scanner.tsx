"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keyboard-wedge scanner support (USB scanners that "type" the code + Enter).
 *
 * Listens globally. A burst of characters arriving faster than a human types
 * (<= 80ms apart) followed by Enter is treated as a scan. When the user is
 * focused in a text field we stay out of the way — the scanner types into the
 * field like a keyboard, and the page can handle Enter on that field itself.
 */
export function useWedgeScanner(
  onScan: (code: string) => void,
  opts?: { minLength?: number; enabled?: boolean }
) {
  const cb = useRef(onScan);
  cb.current = onScan;
  const minLength = opts?.minLength ?? 4;
  const enabled = opts?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    let buf = "";
    let last = 0;

    function isTextTarget(t: EventTarget | null) {
      const el = t as HTMLElement | null;
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      if (isTextTarget(e.target)) return;

      const now = Date.now();
      if (now - last > 80) buf = "";
      last = now;

      if (e.key === "Enter") {
        const code = buf;
        buf = "";
        if (code.length >= minLength) {
          e.preventDefault();
          cb.current(code);
        }
        return;
      }

      if (e.key.length === 1 && /[\w\-]/.test(e.key)) buf += e.key;
      else buf = "";
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, minLength]);
}

/**
 * Camera barcode scanner overlay (html5-qrcode). Reads UPC/EAN/Code128 + QR.
 * Fires onScan once with the first successful read, then the parent closes it.
 */
export function CameraScanOverlay({
  title = "Scan barcode",
  hint = "Center the barcode in the frame.",
  onScan,
  onClose,
}: {
  title?: string;
  hint?: string;
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const divId = "camera-scan-reader";
  const qrRef = useRef<any>(null);
  const firedRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mod: any = await import("html5-qrcode");
        const Html5Qrcode = mod.Html5Qrcode;
        const F = mod.Html5QrcodeSupportedFormats;
        if (cancelled) return;

        const qr = new Html5Qrcode(divId, {
          formatsToSupport: [
            F.UPC_A,
            F.UPC_E,
            F.EAN_13,
            F.EAN_8,
            F.CODE_128,
            F.CODE_39,
            F.QR_CODE,
          ].filter((f: any) => f != null),
          verbose: false,
        });
        qrRef.current = qr;

        await qr.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: { width: 280, height: 170 } },
          (text: string) => {
            if (firedRef.current) return;
            firedRef.current = true;
            onScanRef.current(text.trim());
          },
          () => {}
        );
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? String(e));
      }
    })();

    return () => {
      cancelled = true;
      const qr = qrRef.current;
      qrRef.current = null;
      if (qr) {
        qr.stop()
          .then(() => qr.clear())
          .catch(() => {});
      }
    };
  }, []);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlayCard" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="title" style={{ fontSize: 18 }}>{title}</div>
          <button className="xBtn" type="button" onClick={onClose}>×</button>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>{hint}</div>

        {err ? (
          <div className="statusMsg statusErr">Camera error: {err}</div>
        ) : (
          <div style={{ marginTop: 12, borderRadius: 16, overflow: "hidden" }}>
            <div id={divId} style={{ width: "100%" }} />
          </div>
        )}

        <div className="btnRow">
          <button className="btn" type="button" onClick={onClose} style={{ flex: 1 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
