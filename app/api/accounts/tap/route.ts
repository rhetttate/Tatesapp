import { NextResponse } from "next/server";
import { tpRpc, TpError } from "../../../../lib/tatesPrices";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { key, kind, id, purchaser, save } = await req.json();
    const res = await tpRpc<{ id: number; number: string; lane: number; saved: boolean; full: boolean }>("acct_tap", {
      p_key: String(key ?? ""),
      p_kind: String(kind ?? ""),
      p_id: String(id ?? ""),
      p_purchaser: String(purchaser ?? ""),
      p_save: save !== false,
    });
    return NextResponse.json(res);
  } catch (e) {
    const status = e instanceof TpError ? e.status : 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
