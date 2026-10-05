"use client";

import { useEffect, useRef } from "react";

/** Next local `hour`:`minute` strictly after `from`. */
function nextRunAfter(from: number, hour: number, minute: number) {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Minute past the hour to run at — after the 3:00 data refresh. */
const MINUTE = 5;

/**
 * Reload the page once a night at `hour`:05 (local time, default 3:05am), so
 * the tablets pick up new app versions, which only arrive on a page load. The
 * Bluetooth link to the Pico restores itself after a reload. If `isBusy`
 * says someone is mid-transaction, try again a minute later instead of
 * skipping the night. Like useNightlyRefresh, a missed run fires as soon as
 * the tablet is checked again (every minute, and whenever the screen comes
 * back on).
 */
export function useNightlyReload(isBusy?: () => boolean, hour = 3) {
  const isBusyRef = useRef(isBusy);
  useEffect(() => {
    isBusyRef.current = isBusy;
  });

  useEffect(() => {
    let nextRun = nextRunAfter(Date.now(), hour, MINUTE);

    function check() {
      const now = Date.now();
      if (now < nextRun) return;
      if (isBusyRef.current?.()) {
        nextRun = now + 60_000;
        return;
      }
      nextRun = nextRunAfter(now, hour, MINUTE);
      window.location.reload();
    }

    const t = setInterval(check, 60_000);
    const onVis = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [hour]);
}
