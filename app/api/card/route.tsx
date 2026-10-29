import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { CHAINS } from "@/lib/chains";
import { amount, date, money, multiple, painUsd, price, short } from "@/lib/format";
import { scanWallet, ScanError } from "@/lib/scan";
import { draftFromReport } from "@/lib/scan/draft";
import { getLoss } from "@/lib/store";
import { tierOf } from "@/lib/tier";
import type { PublicLoss } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Card do post em PNG (1080×1350, formato de story/feed), para baixar e compartilhar sem postar.
 * `?id=` usa um post do feed; `?wallet=&target=&caption=` monta o card direto do raio-x.
 */
const W = 1080;
const H = 1350;
const TARGET = /^(wallet|(missed|realized):[a-z]+:[A-Za-z0-9]{20,64})$/;

const KIND = { missed: "Left on the table", realized: "Realized loss", wallet: "Whole wallet" } as const;
const GRADIENTS = [
  "linear-gradient(140deg, #b9a7ff, #6f5ae6)",
  "linear-gradient(140deg, #ff94b8, #d9628f)",
  "linear-gradient(140deg, #8ee6c4, #2a9d75)",
  "linear-gradient(140deg, #ffd08a, #e0895a)",
  "linear-gradient(140deg, #9fd2ff, #4c84d9)",
];
const gradientOf = (s: string) => GRADIENTS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % GRADIENTS.length];

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function resolveLoss(req: NextRequest): Promise<PublicLoss | NextResponse> {
  const q = req.nextUrl.searchParams;
  const id = q.get("id");
  if (id) {
    const loss = await getLoss(id);
    return loss ?? fail("Post not found.", 404);
  }

  const wallet = q.get("wallet")?.trim() ?? "";
  const target = q.get("target") ?? "";
  const caption = (q.get("caption") ?? "").trim().slice(0, 280);
  if (!wallet || !TARGET.test(target)) return fail("Missing wallet or post target.");

  let report;
  try {
    report = await scanWallet(wallet);
  } catch (e) {
    return fail(e instanceof ScanError ? e.message : "Couldn't read the wallet right now.", e instanceof ScanError ? e.status : 502);
  }
  const draft = draftFromReport(report, target);
  if (typeof draft === "string") return fail(draft);
  return {
    ...draft,
    id: "card",
    family: report.family,
    wallet: report.demo ? "example" : report.wallet,
    target,
    caption,
    signature: "",
    respects: 0,
    createdAt: Date.now(),
    example: report.demo,
  };
}

export async function GET(req: NextRequest) {
  const loss = await resolveLoss(req);
  if (loss instanceof NextResponse) return loss;

  const chain = CHAINS[loss.chain];
  const { level, name: tier } = tierOf(loss.amountUsd);
  const sym = `$${loss.token.toUpperCase()}`;
  const title = loss.kind === "wallet" ? `${loss.tokensCount ?? "Several"} tokens` : sym;
  const network = loss.kind === "wallet" ? (loss.family === "solana" ? "Solana" : "EVM") : chain.name;
  const qty = loss.soldAmount ?? 0;
  const move =
    loss.kind === "missed" && qty > 0 && loss.soldUsd !== undefined && loss.valueNowUsd !== undefined
      ? { from: loss.soldUsd / qty, to: loss.valueNowUsd / qty, fromLabel: "You sold here", toLabel: "Today" }
      : loss.kind === "realized" && qty > 0 && loss.soldUsd !== undefined && loss.boughtUsd !== undefined
        ? { from: loss.boughtUsd / qty, to: loss.soldUsd / qty, fromLabel: "Bought at", toLabel: "Sold at" }
        : null;
  const sub =
    loss.kind === "missed" && loss.multiple
      ? `Went up ${multiple(loss.multiple)} after you sold`
      : loss.kind === "wallet"
        ? `Across ${loss.tokensCount} tokens sold too early. The worst was ${sym}.`
        : loss.kind === "realized"
          ? "Bought high, sold low"
          : "";
  const story =
    loss.kind === "missed" && move
      ? `Sold ${amount(qty)} for ${money(loss.soldUsd!)}. Worth ${money(loss.valueNowUsd!)} today.`
      : loss.kind === "realized" && move
        ? `Paid ${money(loss.boughtUsd!)} and got back ${money(loss.soldUsd!)}.`
        : "";

  // Gráfico de dois pontos, igual ao do site: linha reta, área entre a linha e o preço de partida
  const up = move ? move.to >= move.from : true;
  const cx1 = 20, cx2 = 780, cy1 = up ? 150 : 30, cy2 = up ? 30 : 150;

  const png = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 64,
          background: "linear-gradient(160deg, #1a1626 0%, #0e0d12 55%, #1c1119 100%)",
          color: "#f4f2f8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #b9a7ff, #ff94b8)" }} />
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700 }}>
              LossPorn<span style={{ color: "#d9b3e0" }}>Hub</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: "#211f29", border: "1px solid #2b2934", fontSize: 22, color: "#9b97a9" }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: chain.color }} />
            {network}
            <span>·</span>
            <span>{short(loss.wallet)}</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, marginTop: 40, padding: 44, borderRadius: 40, background: "#17161d", border: "1px solid #3a3450" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 84, height: 84, borderRadius: 999, background: gradientOf(loss.token), color: "#17131f", fontSize: 36, fontWeight: 700 }}>
              {loss.token.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>{title}</div>
              <div style={{ display: "flex", fontSize: 24, color: "#9b97a9" }}>{loss.lastSellAt ? `Sold on ${date(loss.lastSellAt)}` : network}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 44 }}>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: "#ff6d74" }}>{KIND[loss.kind]}</div>
            <div style={{ display: "flex", fontSize: 128, fontWeight: 700, letterSpacing: -6, lineHeight: 1 }}>{painUsd(loss.kind, loss.amountUsd)}</div>
            {sub && <div style={{ display: "flex", fontSize: 28, color: "#9b97a9", marginTop: 6 }}>{sub}</div>}
          </div>

          {move && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 44, padding: 32, borderRadius: 28, background: "#211f29" }}>
              <svg width="800" height="180" viewBox="0 0 800 180">
                <line x1="0" x2="800" y1="172" y2="172" stroke="#2b2934" strokeWidth="2" />
                <line x1={cx1} x2={cx2} y1={cy1} y2={cy1} stroke="#9b97a9" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="6 8" />
                <path d={`M${cx1} ${cy1} L${cx2} ${cy2} L${cx2} ${cy1} Z`} fill="rgba(255,109,116,0.18)" />
                <path d={`M${cx1} ${cy1} L${cx2} ${cy2}`} fill="none" stroke="#ff6d74" strokeWidth="5" strokeLinecap="round" />
                <circle cx={cx1} cy={cy1} r="10" fill="#9b97a9" stroke="#211f29" strokeWidth="4" />
                <circle cx={cx2} cy={cy2} r="12" fill="#ff6d74" stroke="#211f29" strokeWidth="4" />
              </svg>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ color: "#9b97a9" }}>{move.fromLabel}</span>
                  <span style={{ fontWeight: 600 }}>{price(move.from)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ color: "#9b97a9" }}>{move.toLabel}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
                    {price(move.to)}
                    {loss.kind === "missed" && loss.multiple ? (
                      <span style={{ padding: "2px 12px", borderRadius: 999, background: "rgba(255,109,116,0.15)", color: "#ff6d74", fontSize: 20 }}>{multiple(loss.multiple)}</span>
                    ) : null}
                  </div>
                </div>
              </div>
              {story && <div style={{ display: "flex", paddingTop: 18, borderTop: "1px solid #2b2934", fontSize: 24, color: "#9b97a9" }}>{story}</div>}
            </div>
          )}

          {loss.caption && (
            <div style={{ display: "flex", gap: 14, marginTop: 32, padding: "22px 28px", borderRadius: 24, border: "1px solid #2b2934", fontSize: 28, lineHeight: 1.35 }}>
              <span style={{ color: "#b9a7ff", fontSize: 44, lineHeight: 0.8 }}>“</span>
              <span>{loss.caption}</span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: "auto", paddingTop: 36 }}>
            <div style={{ display: "flex", flex: 1, gap: 6 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ height: 10, flex: 1, borderRadius: 999, background: i <= level ? "#ff6d74" : "rgba(255,109,116,0.15)" }} />
              ))}
            </div>
            <div style={{ display: "flex", fontSize: 24 }}>
              <span style={{ fontWeight: 600 }}>{tier}</span>
              <span style={{ color: "#9b97a9" }}>&nbsp;· level {level} of 5</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, fontSize: 22, color: "#9b97a9" }}>
          <span>{loss.example ? "Example card" : "Numbers read straight from the blockchain"}</span>
          <span>How much would you have if you hadn't sold?</span>
        </div>
      </div>
    ),
    { width: W, height: H },
  );

  const file = `losspornhub-${loss.kind === "wallet" ? "wallet" : loss.token.toLowerCase()}.png`;
  png.headers.set("Content-Disposition", `attachment; filename="${file}"`);
  png.headers.set("Cache-Control", "no-store");
  return png;
}
