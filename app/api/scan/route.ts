import { NextRequest, NextResponse } from "next/server";
import { scanWallet, ScanError } from "@/lib/scan";
import { onVercel } from "@/lib/scan/errors";

export const dynamic = "force-dynamic";

/** "TimeoutError", "fetch failed: ENOTFOUND api.helius.xyz" etc., para o erro aparecer na tela e não só no terminal */
function describe(e: unknown) {
  if (!(e instanceof Error)) return String(e);
  const cause = e.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code || cause?.message;
  return detail ? `${e.message}: ${detail}` : e.name === "TimeoutError" ? "timeout talking to the data source" : e.message;
}
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() ?? "";
  const t0 = Date.now();
  const res = await answer(wallet);
  // ?trace=1: sempre 200, com o status e o tempo, para conferir o site de fora (ferramentas que só leem respostas 2xx)
  if (req.nextUrl.searchParams.get("trace") !== "1") return res;
  return NextResponse.json({ status: res.status, ms: Date.now() - t0, body: await res.json() });
}

async function answer(wallet: string) {
  try {
    return NextResponse.json(await scanWallet(wallet));
  } catch (e) {
    if (e instanceof ScanError) return NextResponse.json({ error: e.message, code: e.code, hosted: onVercel }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: `Couldn't read this wallet right now (${describe(e)}). Try again.`, code: "scan_failed" }, { status: 502 });
  }
}
