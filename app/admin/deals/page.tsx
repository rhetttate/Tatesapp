"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Deal = {
  id: string;
  name: string;
  price: number;
  upc: string;
  description: string | null;
  image_url: string | null;
  active: boolean;
  department: string | null;
  featured: boolean;
  featured_order: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

const DEPTS = [
  { value: "", label: "— none —" },
  { value: "meat", label: "Meat" },
  { value: "produce", label: "Produce" },
  { value: "grocery", label: "Grocery" },
  { value: "new", label: "New Items" },
  { value: "weekly", label: "Weekly Deals" },
];

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

// UPC-A check digit for 11-digit base
function upcCheckDigit(upc11: string) {
  const d = upc11.split("").map((x) => Number(x));
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8] + d[10];
  const evenSum = d[1] + d[3] + d[5] + d[7] + d[9];
  const total = oddSum * 3 + evenSum;
  const mod = total % 10;
  return mod === 0 ? 0 : 10 - mod;
}

function normDept(d: string) {
  return (d || "").trim().toLowerCase();
}

async function uploadImage(file: File) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = "deal-" + Date.now() + "-" + Math.random().toString(16).slice(2) + "." + ext;

  const { error } = await supabase.storage.from("deal-images").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("deal-images").getPublicUrl(path);
  return data.publicUrl;
}

export default function AdminDealsPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const [deals, setDeals] = useState<Deal[]>([]);
  const [filter, setFilter] = useState<"" | "featured" | "active" | "meat" | "produce" | "grocery" | "new" | "weekly">("featured");

  // Add form
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [upc, setUpc] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [featured, setFeatured] = useState(true);
  const [featuredOrder, setFeaturedOrder] = useState("0");
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD or blank
  const [endDate, setEndDate] = useState("");     // YYYY-MM-DD or blank
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  async function loadDeals() {
    setLoading(true);
    setStatus("");

    const { data, error } = await supabase
      .from("deals")
      .select("id,name,price,upc,description,image_url,active,department,featured,featured_order,start_date,end_date,created_at")
      .order("featured", { ascending: false })
      .order("featured_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) setStatus("Load error: " + error.message);
    setDeals((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { loadDeals(); }, []);

  async function addDeal() {
    setStatus("");
    try {
      if (!name.trim()) throw new Error("Enter deal name.");

      const p = Number(price);
      if (!Number.isFinite(p) || p < 0) throw new Error("Enter a valid price.");

      let u = digitsOnly(upc);
      if (u.length === 11) u = u + String(upcCheckDigit(u));
      if (u.length !== 12) throw new Error("UPC must be 11 or 12 digits (11 auto-adds check digit).");

      const fo = Number(featuredOrder || "0");
      if (!Number.isFinite(fo) || fo < 0) throw new Error("Featured order must be 0 or more.");

      // Dates: allow blank -> null
      const sd = startDate.trim() ? startDate.trim() : null;
      const ed = endDate.trim() ? endDate.trim() : null;

      let img: string | null = (imageUrl || "").trim() || null;
      if (imageFile) img = await uploadImage(imageFile);

      const { error } = await supabase.from("deals").insert({
        name: name.trim(),
        price: p,
        upc: u,
        description: description.trim() || null,
        department: normDept(department) || null,
        featured: !!featured,
        featured_order: fo,
        start_date: sd,
        end_date: ed,
        image_url: img,
        active: true,
      });

      if (error) throw error;

      setName("");
      setPrice("");
      setUpc("");
      setDescription("");
      setDepartment("");
      setFeatured(true);
      setFeaturedOrder("0");
      setStartDate("");
      setEndDate("");
      setImageUrl("");
      setImageFile(null);

      setStatus("Deal saved.");
      await loadDeals();
    } catch (e: any) {
      setStatus("Save error: " + (e?.message ?? String(e)));
    }
  }

  async function updateDeal(id: string, patch: Partial<Deal>) {
    setStatus("");
    const { error } = await supabase.from("deals").update(patch).eq("id", id);
    if (error) setStatus("Update error: " + error.message);
    await loadDeals();
  }

  async function removeDeal(id: string) {
    setStatus("");
    const { error } = await supabase.from("deals").delete().eq("id", id);
    if (error) setStatus("Delete error: " + error.message);
    await loadDeals();
  }

  const shown = useMemo(() => {
    const list = [...deals];
    if (filter === "featured") return list.filter(d => d.featured);
    if (filter === "active") return list.filter(d => d.active);
    if (filter === "") return list;
    return list.filter(d => normDept(d.department || "") === filter);
  }, [deals, filter]);

  return (
    <div className="card" style={{ padding: 16, borderRadius: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 22 }}>Deals Manager</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Set departments + featured order + dates to control the home page.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={loadDeals}>Refresh</button>
        </div>
      </div>

      <div className="hr" />

      {/* Add Deal */}
      <div className="card" style={{ padding: 14, borderRadius: 16 }}>
        <div style={{ fontWeight: 950, fontSize: 18 }}>Add Deal</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          Leave dates blank to show always. Or set a start/end range.
        </div>

        <div className="hr" />

        <div className="grid" style={{ gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
          <div style={{ gridColumn: "span 12" }}>
            <label>Deal Name
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>

          <div style={{ gridColumn: "span 6" }}>
            <label style={{ fontWeight: 900 }}>Price
              <input className="input" style={{ fontSize: 18, fontWeight: 900 }} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
            </label>
          </div>

          <div style={{ gridColumn: "span 6" }}>
            <label>UPC (11 or 12 digits)
              <input className="input" value={upc} onChange={(e) => setUpc(e.target.value)} />
            </label>
          </div>

          <div style={{ gridColumn: "span 12" }}>
            <label style={{ fontWeight: 900 }}>Description
              <textarea className="input" style={{ minHeight: 90, fontSize: 16 }} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>

          <div style={{ gridColumn: "span 6" }}>
            <label>Department
              <select className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
                {DEPTS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </label>
          </div>

          <div style={{ gridColumn: "span 6" }}>
            <label>Featured Order (0 first)
              <input className="input" value={featuredOrder} onChange={(e) => setFeaturedOrder(e.target.value)} inputMode="numeric" />
            </label>
          </div>

          <div style={{ gridColumn: "span 6" }}>
            <label>Start Date (optional)
              <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
          </div>

          <div style={{ gridColumn: "span 6" }}>
            <label>End Date (optional)
              <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>

          <div style={{ gridColumn: "span 12", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900 }}>
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} style={{ transform: "scale(1.25)" }} />
              Featured (Top Deal)
            </label>
          </div>

          <div style={{ gridColumn: "span 12" }}>
            <label>Image URL (optional)
              <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
            </label>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>Or upload:</div>
            <input className="input" type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
          </div>

          <div style={{ gridColumn: "span 12" }}>
            <button className="btn btnPrimary" onClick={addDeal} style={{ width: "100%", padding: "14px 16px", fontSize: 16 }}>
              Save Deal
            </button>
          </div>
        </div>

        {status && <p style={{ marginTop: 10 }}>{status}</p>}
      </div>

      <div className="hr" />

      {/* Filter */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <div className="muted" style={{ fontSize: 13 }}>Show:</div>
        <select className="input" style={{ maxWidth: 220 }} value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="featured">Top Deals (featured)</option>
          <option value="active">Active only</option>
          <option value="">All</option>
          <option value="meat">Meat</option>
          <option value="produce">Produce</option>
          <option value="grocery">Grocery</option>
          <option value="new">New Items</option>
          <option value="weekly">Weekly</option>
        </select>
        <div className="muted" style={{ fontSize: 13 }}>Count: <b>{shown.length}</b></div>
      </div>

      {/* Deals list */}
      {loading ? (
        <div className="muted">Loading...</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {shown.map((d) => (
            <div key={d.id} className="card" style={{ padding: 14, borderRadius: 16 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
                <div style={{ width: 120, height: 90, borderRadius: 14, background: "rgba(0,0,0,.05)", overflow: "hidden", flex: "0 0 auto" }}>
                  {d.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.image_url} alt={d.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : null}
                </div>

                <div style={{ flex: "1 1 280px", minWidth: 260 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <input
                      className="input"
                      style={{ fontWeight: 950 }}
                      value={d.name}
                      onChange={(e) => setDeals(prev => prev.map(x => x.id === d.id ? { ...x, name: e.target.value } : x))}
                      onBlur={(e) => updateDeal(d.id, { name: e.target.value.trim() || d.name })}
                    />
                    <input
                      className="input"
                      style={{ width: 120, fontSize: 18, fontWeight: 950, textAlign: "right" }}
                      value={String(d.price ?? "")}
                      inputMode="decimal"
                      onChange={(e) => setDeals(prev => prev.map(x => x.id === d.id ? { ...x, price: Number(e.target.value) } : x))}
                      onBlur={(e) => updateDeal(d.id, { price: Number(e.target.value) })}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10, marginTop: 10 }}>
                    <div style={{ gridColumn: "span 6" }}>
                      <label className="muted" style={{ fontSize: 12 }}>Department</label>
                      <select
                        className="input"
                        value={d.department || ""}
                        onChange={(e) => updateDeal(d.id, { department: normDept(e.target.value) || null })}
                      >
                        {DEPTS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
                      </select>
                    </div>

                    <div style={{ gridColumn: "span 6" }}>
                      <label className="muted" style={{ fontSize: 12 }}>UPC</label>
                      <input
                        className="input"
                        value={d.upc}
                        onChange={(e) => setDeals(prev => prev.map(x => x.id === d.id ? { ...x, upc: e.target.value } : x))}
                        onBlur={(e) => {
                          let u = digitsOnly(e.target.value);
                          if (u.length === 11) u = u + String(upcCheckDigit(u));
                          if (u.length === 12) updateDeal(d.id, { upc: u });
                        }}
                      />
                    </div>

                    <div style={{ gridColumn: "span 12" }}>
                      <label className="muted" style={{ fontSize: 12 }}>Description</label>
                      <textarea
                        className="input"
                        style={{ minHeight: 70 }}
                        value={d.description || ""}
                        onChange={(e) => setDeals(prev => prev.map(x => x.id === d.id ? { ...x, description: e.target.value } : x))}
                        onBlur={(e) => updateDeal(d.id, { description: e.target.value.trim() || null })}
                      />
                    </div>

                    <div style={{ gridColumn: "span 6" }}>
                      <label className="muted" style={{ fontSize: 12 }}>Start Date</label>
                      <input
                        className="input"
                        type="date"
                        value={d.start_date || ""}
                        onChange={(e) => updateDeal(d.id, { start_date: e.target.value || null })}
                      />
                    </div>

                    <div style={{ gridColumn: "span 6" }}>
                      <label className="muted" style={{ fontSize: 12 }}>End Date</label>
                      <input
                        className="input"
                        type="date"
                        value={d.end_date || ""}
                        onChange={(e) => updateDeal(d.id, { end_date: e.target.value || null })}
                      />
                    </div>

                    <div style={{ gridColumn: "span 12" }}>
                      <label className="muted" style={{ fontSize: 12 }}>Image URL</label>
                      <input
                        className="input"
                        value={d.image_url || ""}
                        onChange={(e) => setDeals(prev => prev.map(x => x.id === d.id ? { ...x, image_url: e.target.value } : x))}
                        onBlur={(e) => updateDeal(d.id, { image_url: e.target.value.trim() || null })}
                        placeholder="https://..."
                      />
                    </div>

                    <div style={{ gridColumn: "span 12", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
                        <input
                          type="checkbox"
                          checked={!!d.featured}
                          onChange={(e) => updateDeal(d.id, { featured: e.target.checked })}
                          style={{ transform: "scale(1.25)" }}
                        />
                        Featured (Top Deals)
                      </label>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="muted" style={{ fontSize: 12 }}>Order</span>
                        <input
                          className="input"
                          style={{ width: 90 }}
                          value={String(d.featured_order ?? 0)}
                          inputMode="numeric"
                          onChange={(e) => setDeals(prev => prev.map(x => x.id === d.id ? { ...x, featured_order: Number(e.target.value) } : x))}
                          onBlur={(e) => updateDeal(d.id, { featured_order: Number(e.target.value || "0") })}
                        />
                      </div>
                    </div>

                    <div style={{ gridColumn: "span 12", display: "flex", gap: 10 }}>
                      <button
                        className={"btn " + (d.active ? "btnPrimary" : "")}
                        onClick={() => updateDeal(d.id, { active: !d.active })}
                        style={{ flex: 1 }}
                      >
                        {d.active ? "Active" : "Inactive"}
                      </button>
                      <button className="btn" onClick={() => removeDeal(d.id)} style={{ flex: 1 }}>
                        Delete
                      </button>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          ))}

          {shown.length === 0 && <div className="muted">No deals match this filter.</div>}
        </div>
      )}
    </div>
  );
}