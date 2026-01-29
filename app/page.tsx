"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type DealRow = {
  id: string;
  name: string | null;
  description: string | null;
  price: number | null;
  image_url: string | null;
  featured: boolean | null;
  featured_order: number | null;
  department: string | null;
  created_at: string | null;
};

function money(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return "$" + x.toFixed(2);
}

function normDept(s: any) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function titleDept(s: string) {
  if (!s) return "";
  return s
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Horizontal swipe row
function SwipeRow({
  title,
  deals,
  compact = false,
}: {
  title: string;
  deals: DealRow[];
  compact?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  if (!deals.length) return null;

  return (
    <div className="section">
      <div className="sectionHead">
        <div className="sectionTitle">{title}</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Swipe →
        </div>
      </div>

      <div ref={rowRef} className="swipeRow" aria-label={title}>
        {deals.map((d) => (
          <div key={d.id} className={"dealCard " + (compact ? "dealCardCompact" : "")}>
            {d.image_url ? (
              <img
                className={"dealImg " + (compact ? "dealImgCompact" : "")}
                src={d.image_url}
                alt={String(d.name ?? "Deal")}
                draggable={false}
              />
            ) : (
              <div className={"dealImg " + (compact ? "dealImgCompact" : "")} />
            )}

            <div className="dealBody">
              <div className="dealName">{d.name ?? "Deal"}</div>
              {d.description ? <div className="dealDesc">{d.description}</div> : null}
              {d.price != null ? <div className="dealPrice">{money(d.price)}</div> : null}
            </div>
          </div>
        ))}
        <div className="swipeEndCap" />
      </div>
    </div>
  );
}

export default function DealsHomePage() {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  // ✅ 0 = no auto refresh
  const AUTO_REFRESH_MS = 0;

  async function loadDeals() {
    setStatus("");
    try {
      const { data, error } = await supabase
        .from("deals")
        .select("id,name,description,price,image_url,featured,featured_order,department,created_at")
        .order("featured", { ascending: false })
        .order("featured_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDeals((data as any) || []);
    } catch (e: any) {
      setStatus("Load error: " + (e?.message ?? String(e)));
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDeals();

    if (AUTO_REFRESH_MS > 0) {
      const t = setInterval(loadDeals, AUTO_REFRESH_MS);
      return () => clearInterval(t);
    }
  }, []);

  const featured = useMemo(() => deals.filter((d) => !!d.featured), [deals]);

  const byDept = useMemo(() => {
    const m = new Map<string, DealRow[]>();
    for (const d of deals) {
      const key = normDept(d.department);
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(d);
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ key: k, title: titleDept(k), deals: v }));
  }, [deals]);

  return (
    <div className="page">
      <style jsx global>{`
        * {
          -webkit-tap-highlight-color: transparent;
        }

        /* ✅ Make page scrolling explicit */
        .page {
          min-height: 100vh;
          background: #f3f7ff;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .wrap {
          max-width: 980px;
          margin: 0 auto;
          padding: 14px 18px 26px;
        }

        /* ✅ Full-width logo bar above tabs */
        .logoBar {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 10px 0 6px;
        }

        .logoBox {
          width: 100%;
          border-radius: 18px;
          border: 1px solid rgba(29, 78, 216, 0.14);
          background: rgba(255, 255, 255, 0.75);
          box-shadow: 0 8px 24px rgba(10, 42, 122, 0.06);
          padding: 12px 14px;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        /* Put your logo in /public/logo.png and it will show */
        .logoImg {
          max-width: 100%;
          height: 54px;
          object-fit: contain;
          display: block;
        }

        .tabs {
          display: flex;
          justify-content: center;
          gap: 44px;
          font-weight: 950;
          margin: 10px 0 14px;
        }
        .tab {
          text-decoration: none;
          color: #94a3b8;
          padding-bottom: 6px;
        }
        .tabActive {
          color: #1d4ed8;
          border-bottom: 3px solid #1d4ed8;
        }

        /* ✅ No top header card anymore — content just flows */
        .statusLine {
          margin-top: 6px;
          color: rgba(10, 42, 122, 0.65);
          font-weight: 850;
          font-size: 13px;
          text-align: center;
        }

        .section {
          margin-top: 16px;
        }

        .sectionHead {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          padding: 0 2px;
        }

        .sectionTitle {
          font-weight: 950;
          color: #0a2a7a;
          font-size: 16px;
        }

        .muted {
          color: rgba(10, 42, 122, 0.65);
          font-weight: 800;
        }

        /* ✅ Swipe row: only horizontal pan inside this row */
        .swipeRow {
          margin-top: 10px;
          display: flex;
          gap: 12px;
          overflow-x: auto;
          overflow-y: visible;
          padding: 2px 2px 8px;

          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;

          touch-action: pan-x; /* horizontal only */
          scrollbar-width: none;
        }
        .swipeRow::-webkit-scrollbar {
          display: none;
        }
        .swipeEndCap {
          width: 2px;
          flex: 0 0 auto;
        }

        .dealCard {
          flex: 0 0 auto;
          width: 300px;
          scroll-snap-align: start;

          border-radius: 22px;
          border: 1px solid rgba(10, 60, 160, 0.14);
          background: #f8fbff;
          display: grid;
          overflow: hidden;

          /* ✅ Let vertical scroll work even when finger is on cards */
          touch-action: pan-y;
        }
        .dealCardCompact {
          width: 270px;
        }

        .dealImg {
          width: 100%;
          height: 160px;
          object-fit: cover;
          background: #eaf1ff;

          /* ✅ Important: don’t block vertical scroll on iOS */
          pointer-events: none;
          user-select: none;
          -webkit-user-drag: none;
        }
        .dealImgCompact {
          height: 140px;
        }

        .dealBody {
          padding: 14px;
          display: grid;
          gap: 7px;
        }
        .dealName {
          font-weight: 950;
          font-size: 18px;
          color: #0a2a7a;
          line-height: 1.12;
        }
        .dealDesc {
          color: rgba(10, 42, 122, 0.7);
          font-weight: 800;
          font-size: 14px;
          line-height: 1.22;
        }
        .dealPrice {
          font-weight: 950;
          font-size: 22px;
          color: #1d4ed8;
          margin-top: 2px;
        }

        @media (max-width: 420px) {
          .dealCard {
            width: 86vw;
          }
          .logoImg {
            height: 46px;
          }
        }
      `}</style>

      <div className="wrap">
        {/* ✅ Logo spot ABOVE tabs */}
        <div className="logoBar">
          <div className="logoBox">
            {/* Put a file at /public/logo.png (or change the src here) */}
            <img className="logoImg" src="tatessign.png" />
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <Link href="/" className={"tab tabActive"}>
            Deals
          </Link>
          <Link href="/coupon" className="tab">
            Coupons
          </Link>
          <Link href="/member" className="tab">
            Points
          </Link>
        </div>

        {/* optional tiny status line */}
        {status ? <div className="statusLine">{status}</div> : null}
        {!status && loading ? <div className="statusLine">Loading…</div> : null}

        {/* content */}
        {featured.length > 0 ? <SwipeRow title="Top Deals" deals={featured} /> : null}

        {byDept.length > 0 ? (
          <>
            {byDept.map((sec) => (
              <SwipeRow key={sec.key} title={sec.title} deals={sec.deals} compact />
            ))}
          </>
        ) : (
          !loading && <div className="statusLine">No deals yet.</div>
        )}
      </div>
    </div>
  );
}
