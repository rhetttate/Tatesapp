import { NextResponse } from "next/server";
import { tpRpc, TpError } from "../../../../lib/tatesPrices";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { key, kind, id } = await req.json();
    const rows = await tpRpc<{ name: string }[]>("acct_purchasers", {
      p_key: String(key ?? ""),
      p_kind: String(kind ?? ""),
      p_id: String(id ?? ""),
    });
    return NextResponse.json({ names: (Array.isArray(rows) ? rows : []).map((r) => r.name) });
  } catch (e) {
    const status = e instanceof TpError ? e.status : 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
