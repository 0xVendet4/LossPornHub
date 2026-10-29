import { NextRequest, NextResponse } from "next/server";
import { payRespects } from "@/lib/store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const count = await payRespects(id, ip);
  if (count === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ respects: count });
}
