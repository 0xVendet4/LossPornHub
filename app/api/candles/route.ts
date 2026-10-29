import { NextRequest, NextResponse } from "next/server";
import { detectFamily, isChainKey } from "@/lib/chains";
import { demoCandles, fetchCandles } from "@/lib/candles";

/** Candles do token desde um pouco antes da venda. Sempre responde 200: lista vazia faz o site cair no gráfico simples. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const chain = q.get("chain");
  const token = q.get("token") ?? "";
  const pool = q.get("pool");
  const since = Number(q.get("since"));
  if (!isChainKey(chain) || !detectFamily(token) || !(since > 0) || (pool && !/^[A-Za-z0-9]{20,70}$/.test(pool)))
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });

  // Carteira de exemplo: preços inventados, então os candles também
  if (q.get("demo") === "1") {
    const from = Number(q.get("from"));
    const to = Number(q.get("to"));
    if (!(from > 0) || !(to > 0)) return NextResponse.json({ error: "Invalid prices." }, { status: 400 });
    return NextResponse.json({ candles: demoCandles(token, since, from, to) });
  }

  const candles = await fetchCandles(chain, token, since, pool);
  return NextResponse.json(
    { candles },
    { headers: { "Cache-Control": candles.length ? "public, s-maxage=600, stale-while-revalidate=1200" : "no-store" } },
  );
}
