import { NextRequest, NextResponse } from "next/server";
import { addLoss, listLosses, type NewLoss, type Sort } from "@/lib/store";
import { parsePost, verifyPostSignature } from "@/lib/verify";
import { scanWallet, ScanError } from "@/lib/scan";
import { clientIp } from "@/lib/scan-cache";
import { draftFromReport } from "@/lib/scan/draft";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get("sort");
  const sort: Sort = s === "top" || s === "respects" ? s : "new";
  return NextResponse.json(await listLosses(sort));
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const parsed = parsePost(await req.json().catch(() => null));
  if (!parsed.ok) return fail(parsed.error);
  const r = parsed.req;

  if (!(await verifyPostSignature(r))) return fail("The signature doesn't match this wallet.", 401);

  // Os números vêm do raio-x feito aqui no servidor, nunca do navegador
  let report;
  try {
    report = await scanWallet(r.wallet, { ip: clientIp(req) });
  } catch (e) {
    return fail(e instanceof ScanError ? e.message : "Couldn't read the wallet right now.", e instanceof ScanError ? e.status : 502);
  }

  const draft = draftFromReport(report, r.target);
  if (typeof draft === "string") return fail(draft);
  const loss: NewLoss = { ...draft, family: r.family, wallet: r.wallet, target: r.target, caption: r.caption, signature: r.signature };

  const saved = await addLoss(loss);
  if (saved === "duplicate") return fail("You already posted this one.", 409);
  return NextResponse.json(saved, { status: 201 });
}
