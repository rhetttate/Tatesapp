import { NextResponse } from "next/server";
import { tpRpc, TpError } from "../../../../lib/tatesPrices";

export const dynamic = "force-dynamic";

type Row = { id: string; number: string };

export async function POST(req: Request) {
  try {
    const { key, id, phone } = await req.json();
    const out = await tpRpc<Row | Row[]>("acct_set_phone", {
      p_key: String(key ?? ""),
      p_id: String(id ?? ""),
      p_phone: String(phone ?? ""),
    });
    const r = Array.isArray(out) ? out[0] : out;
    return NextResponse.json({ id: r?.id ?? String(id ?? ""), number: r?.number ?? "" });
  } catch (e) {
    const status = e instanceof TpError ? e.status : 400;
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate key|23505/i.test(msg)) {
      return NextResponse.json({ error: "That number is already on file for another customer" }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status });
  }
}
