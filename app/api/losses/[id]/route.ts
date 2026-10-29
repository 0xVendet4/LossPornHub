import { NextRequest, NextResponse } from "next/server";
import { deleteLoss } from "@/lib/store";
import { parseDelete, verifyDeleteSignature } from "@/lib/verify";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Apaga um post. Só vale a assinatura da carteira que postou ou de outra do mesmo perfil. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = parseDelete(id, await req.json().catch(() => null));
  if (!parsed.ok) return fail(parsed.error);
  if (!(await verifyDeleteSignature(parsed.req))) return fail("The signature doesn't match this wallet.", 401);

  const r = await deleteLoss(id, parsed.req.wallet);
  if (r === "not_found") return fail("Post not found.", 404);
  if (r === "not_owner") return fail("Only the wallet that posted this, or one linked to it, can delete it.", 403);
  return NextResponse.json({ deleted: true });
}
