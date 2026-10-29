import { NextRequest, NextResponse } from "next/server";
import { short } from "@/lib/format";
import { linkWallets, unlinkWallet } from "@/lib/store";
import { badLinkSignature, parseLink, parseUnlink, verifyUnlinkSignature } from "@/lib/verify";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Junta carteiras num perfil anônimo. Cada uma assina a mesma mensagem com o mesmo código. */
export async function POST(req: NextRequest) {
  const parsed = parseLink(await req.json().catch(() => null));
  if (!parsed.ok) return fail(parsed.error);
  const bad = await badLinkSignature(parsed.req);
  if (bad) return fail(`The signature doesn't match ${short(bad)}.`, 401);
  const profile = await linkWallets(parsed.req.entries.map((e) => e.wallet));
  return NextResponse.json({ profile });
}

/** Tira uma carteira do perfil, com a assinatura dela. */
export async function DELETE(req: NextRequest) {
  const parsed = parseUnlink(await req.json().catch(() => null));
  if (!parsed.ok) return fail(parsed.error);
  if (!(await verifyUnlinkSignature(parsed.req))) return fail("The signature doesn't match this wallet.", 401);
  if (!(await unlinkWallet(parsed.req.wallet))) return fail("This wallet isn't linked to a profile.", 404);
  return NextResponse.json({ unlinked: true });
}
