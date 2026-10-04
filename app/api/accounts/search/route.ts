import { NextResponse } from "next/server";
import { tpRpc, TpError } from "../../../../lib/tatesPrices";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string; number: string; kind: string };

export async function POST(req: Request) {
  try {
    const { key, kind, q } = await req.json();
    const rows = await tpRpc<Row[]>("acct_search", {
      p_key: String(key ?? ""),
      p_kind: String(kind ?? ""),
      p_query: String(q ?? ""),
    });
    return NextResponse.json({ rows });
  } catch (e) {
    const status = e instanceof TpError ? e.status : 400;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
