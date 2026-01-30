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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "0 2px" }}>
        <div style={{ fontWeight: 950, color: "#0a2a7a", fontSize: 16 }}>{title}</div>
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
    <div style={{ minHeight: "100vh", padding: 18 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "14px 18px 26px" }}>
        {/* LOGO BAR */}
        <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", padding: "10px 0 6px" }}>
          <div
            style={{
              width: "100%",
              borderRadius: 18,
              border: "1px solid rgba(29, 78, 216, 0.14)",
              background: "rgba(255, 255, 255, 0.75)",
              boxShadow: "0 8px 24px rgba(10, 42, 122, 0.06)",
              padding: "12px 14px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
           <img
            src="/tatessign.png"
            alt="Tate’s Supermarket"
            className="logoImg"
          />


          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", justifyContent: "center", gap: 44, fontWeight: 950, margin: "10px 0 14px" }}>
          <Link href="/" style={{ color: "#1d4ed8", borderBottom: "3px solid #1d4ed8", paddingBottom: 6 }}>
            Deals
          </Link>
          <Link href="/coupon" style={{ color: "#94a3b8", paddingBottom: 6 }}>
            Coupons
          </Link>
          <Link href="/member" style={{ color: "#94a3b8", paddingBottom: 6 }}>
            Points
          </Link>
        </div>

        {/* tiny status line only */}
        {status ? (
          <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>{status}</div>
        ) : loading ? (
          <div className="muted" style={{ fontSize: 13, textAlign: "center" }}>Loading…</div>
        ) : null}

        {/* DEALS */}
        {featured.length > 0 ? <SwipeRow title="Top Deals" deals={featured} /> : null}

        {byDept.length > 0 ? (
          <>
            {byDept.map((sec) => (
              <SwipeRow key={sec.key} title={sec.title} deals={sec.deals} compact />
            ))}
          </>
        ) : (
          !loading && <div className="muted" style={{ marginTop: 14, textAlign: "center" }}>No deals yet.</div>
        )}
      </div>
    </div>
  );
}
