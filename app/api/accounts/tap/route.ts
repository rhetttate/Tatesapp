import { NextResponse } from "next/server";
import { tpRpc, TpError } from "../../../../lib/tatesPrices";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { key, kind, id, purchaser } = await req.json();
    const res = await tpRpc<{ id: number; number: string }>("acct_tap", {
      p_key: String(key ?? ""),
      p_kind: String(kind ?? ""),
      p_id: String(id ?? ""),
      p_purchaser: String(purchaser ?? ""),
    });
    return NextResponse.json(res);
  } catch (e) {
    const status = e instanceof TpError ? e.status : 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
