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
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div className="sectionTitle">{title}</div>
        <div className="muted" style={{ fontSize: 12 }}>Swipe →</div>
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
      </div>
    </div>
  );
}

export default function DealsHomePage() {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  // ✅ set to 0 to disable auto-refresh completely
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

  // Group by department, only if department has items
  const byDept = useMemo(() => {
    const m = new Map<string, DealRow[]>();
    for (const d of deals) {
      const key = normDept(d.department);
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(d);
    }
    // keep stable order by name of department
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ key: k, title: titleDept(k), deals: v }));
  }, [deals]);

  return (
    <div className="pageRoot">
      <style jsx global>{`
        * { -webkit-tap-highlight-color: transparent; }
        html, body {
          height: auto;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
        }

        .pageRoot {
          min-height: 100vh;
          background: #f3f7ff;
          padding: 18px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y; /* ✅ vertical scroll anywhere */
        }

        .pageRoot * {
          touch-action: pan-y; /* ✅ fixes “won’t scroll over images/cards” */
        }

        /* Keep horizontal swipe working inside swipe rows */
        .swipeRow { touch-action: pan-x; }
        .swipeRow * { touch-action: pan-x; }

        /* iOS: prevent images from “capturing” the gesture */
        img {
          -webkit-user-drag: none;
          user-select: none;
        }

        .wrap { max-width: 980px; margin: 0 auto; }

        .tabs {
          display: flex; justify-content: center; gap: 44px;
          font-weight: 950; margin-bottom: 14px;
        }
        .tab { text-decoration: none; color: #94a3b8; padding-bottom: 6px; }
        .tabActive { color: #1d4ed8; border-bottom: 3px solid #1d4ed8; }

        .card {
          background: #fff; border-radius: 22px; padding: 18px;
          border: 1px solid rgba(29,78,216,0.14);
          box-shadow: 0 8px 24px rgba(10,42,122,0.06);
        }
        .title { font-size: 22px; font-weight: 950; color: #0a2a7a; }
        .muted { color: rgba(10,42,122,0.65); font-weight: 800; }

        .hr { height: 1px; background: rgba(29,78,216,0.12); margin: 14px 0; }

        .sectionTitle {
          font-weight: 950;
          color: #0a2a7a;
          font-size: 16px;
        }

        /* ✅ Swipe carousel row */
        .swipeRow {
          margin-top: 10px;
          display: flex;
          gap: 12px;
          overflow-x: auto;
          padding-bottom: 6px;

          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;

          /* hide scrollbar (most browsers) */
          scrollbar-width: none;
        }
        .swipeRow::-webkit-scrollbar { display: none; }

        .dealCard {
          flex: 0 0 auto;
          width: 300px;
          scroll-snap-align: start;

          border-radius: 22px;
          border: 1px solid rgba(10,60,160,0.14);
          background: #f8fbff;
          display: grid;
        }

        .dealCardCompact { width: 270px; }

        .dealImg {
          width: 100%;
          height: 160px;
          object-fit: cover;
          background: #eaf1ff;
          display: block;
        }
        .dealImgCompact { height: 140px; }

        .dealBody { padding: 14px; display: grid; gap: 7px; }
        .dealName { font-weight: 950; font-size: 18px; color: #0a2a7a; line-height: 1.12; }
        .dealDesc { color: rgba(10,42,122,0.70); font-weight: 800; font-size: 14px; line-height: 1.22; }
        .dealPrice { font-weight: 950; font-size: 22px; color: #1d4ed8; margin-top: 2px; }

        /* Logo / brand header */
        .brandRow {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 10px;
        }
        .logoBox {
          height: 44px;
          width: 44px;
          border-radius: 14px;
          background: rgba(29,78,216,0.10);
          border: 1px solid rgba(29,78,216,0.18);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 950;
          color: #1d4ed8;
          overflow: hidden;
          flex: 0 0 auto;
        }
        .logoImg {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .brandText {
          display: grid;
          gap: 2px;
          text-align: center;
        }
        .brandName {
          font-weight: 950;
          color: #0a2a7a;
          font-size: 16px;
          line-height: 1.1;
        }
        .brandSub {
          color: rgba(10,42,122,0.65);
          font-weight: 850;
          font-size: 12px;
          line-height: 1.1;
        }

        @media (max-width: 420px) {
          .dealCard { width: 86vw; }
        }
      `}</style>

      <div className="wrap">
        {/* Top tabs */}
        <div className="tabs">
          <Link href="/" className={"tab tabActive"}>Deals</Link>
          <Link href="/coupon" className="tab">Coupons</Link>
          <Link href="/member" className="tab">Points</Link>
        </div>

        {/* ✅ Logo spot (replaces the old header row) */}
        <div className="brandRow">
          {/* Option 1: Put your real logo image here */}
          {/* <div className="logoBox"><img className="logoImg" src="/logo.png" alt="Logo" /></div> */}

          {/* Option 2: Placeholder badge until you add /public/logo.png */}
          <div className="logoBox">TS</div>

          <div className="brandText">
            <div className="brandName">Tate&apos;s Supermarket</div>
            <div className="brandSub">{loading ? "Loading…" : `${deals.length} deals`}</div>
          </div>
        </div>

        <div className="card">
          {status ? <div style={{ marginTop: 2 }}>{status}</div> : null}

          {featured.length > 0 ? (
            <SwipeRow title="Top Deals" deals={featured} />
          ) : null}

          {byDept.length > 0 ? (
            <>
              {byDept.map((sec) => (
                <SwipeRow
                  key={sec.key}
                  title={sec.title}
                  deals={sec.deals}
                  compact
                />
              ))}
            </>
          ) : (
            !loading && <div className="muted">No department deals yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
