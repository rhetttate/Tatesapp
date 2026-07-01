"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import TopNav from "./components/topnav";

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
    <div className="fadeIn">
      <div className="sectionHead">
        <div className="sectionTitle">{title}</div>
        <div className="sectionHint">Swipe →</div>
      </div>

      <div className="swipeBleed">
        <div ref={rowRef} className="swipeRow" aria-label={title}>

          {/* center spacer */}
          <div className="swipeStartCap" />

          {deals.map((d) => (
            <div
              key={d.id}
              className={"dealCard " + (compact ? "dealCardCompact" : "")}
            >
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
                {d.description && <div className="dealDesc">{d.description}</div>}
                {d.price != null && <div className="dealPrice">{money(d.price)}</div>}
              </div>
            </div>
          ))}

          <div className="swipeEndCap" />
        </div>
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
    <div className="pageFrame">
      <div className="pageFrameInner">
        <TopNav />

        <a href="/member" className="homeHero fadeIn" style={{ display: "block", textDecoration: "none" }}>
          <div className="homeHeroEyebrow">Tate's Rewards</div>
          <div className="homeHeroTitle">Fresh deals & points, every day</div>
          <div className="homeHeroSub">
            Browse today's savings, clip coupons, and earn points on every trip.
          </div>
          <span className="homeHeroCta">View my points →</span>
        </a>

        {status ? (
          <div className="statusMsg statusErr" style={{ textAlign: "center" }}>
            {status}
          </div>
        ) : null}

        {loading && !status ? <DealsSkeleton /> : null}

        {!loading && featured.length > 0 ? (
          <SwipeRow title="Top Deals" deals={featured} />
        ) : null}

        {!loading && byDept.length > 0 ? (
          <>
            {byDept.map((sec) => (
              <SwipeRow key={sec.key} title={sec.title} deals={sec.deals} compact />
            ))}
          </>
        ) : null}

        {!loading && !status && featured.length === 0 && byDept.length === 0 ? (
          <div className="card fadeIn" style={{ marginTop: 22, textAlign: "center" }}>
            <div className="title">No deals yet</div>
            <div className="muted" style={{ marginTop: 8 }}>
              Check back soon — fresh savings are on the way.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DealsSkeleton() {
  return (
    <div className="fadeIn">
      <div className="sectionHead">
        <div className="skeleton" style={{ height: 18, width: 130 }} />
      </div>
      <div className="swipeBleed">
        <div className="swipeRow">
          <div className="swipeStartCap" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="dealCard">
              <div className="skeleton" style={{ height: 188, borderRadius: 0 }} />
              <div className="dealBody">
                <div className="skeleton" style={{ height: 18, width: "70%" }} />
                <div className="skeleton" style={{ height: 13, width: "90%" }} />
                <div className="skeleton" style={{ height: 22, width: 80, marginTop: 4 }} />
              </div>
            </div>
          ))}
          <div className="swipeEndCap" />
        </div>
      </div>
    </div>
  );
}
