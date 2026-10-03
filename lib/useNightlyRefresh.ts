"use client";

import { useEffect, useRef } from "react";

/** Next local `hour`:00 strictly after `from`. */
function nextRunAfter(from: number, hour: number) {
  const d = new Date(from);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * Re-run `refresh` once a night at `hour` (local time, default 3am), so the
 * tablets pick up PLU / sale changes made in admin without anyone reloading
 * the page. The tablets stay open for days, and Android may freeze timers
 * while the screen is off, so a missed run fires as soon as the tablet is
 * checked again (every minute, and whenever the screen comes back on).
 */
export function useNightlyRefresh(refresh: () => void, hour = 3) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    let nextRun = nextRunAfter(Date.now(), hour);

    function check() {
      const now = Date.now();
      if (now < nextRun) return;
      nextRun = nextRunAfter(now, hour);
      refreshRef.current();
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
