import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { CHAINS } from "@/lib/chains";
import { demoCandles, fetchCandles, type Candle } from "@/lib/candles";
import { candlesMatch, plotCandles } from "@/lib/candle-plot";
import { amount, date, money, multiple, painUsd, price, usd } from "@/lib/format";
import { scanWallet, ScanError } from "@/lib/scan";
import { draftFromReport } from "@/lib/scan/draft";
import { toPublic } from "@/lib/privacy";
import { getLoss } from "@/lib/store";
import { tierOf } from "@/lib/tier";
import type { PublicLoss } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Card do post em PNG para baixar e compartilhar sem postar: vertical (1080×1350, feed e story)
 * ou horizontal (`&layout=wide`, 1600×900, timeline do X).
 * `?id=` usa um post do feed; `?wallet=&target=&caption=` monta o card direto do raio-x.
 */
const TARGET = /^(total|wallet|(missed|realized):[a-z]+:[A-Za-z0-9]{20,64})$/;

const KIND = { missed: "Left on the table", realized: "Realized loss", wallet: "Whole wallet", total: "Total loss porn" } as const;
const C = { card: "#17161d", raise: "#211f29", line: "#2b2934", edge: "#3a3450", fg: "#f4f2f8", dim: "#9b97a9", lilac: "#b9a7ff", loss: "#ff6d74", gain: "#62e0a8" };
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
  // Mesmos números arredondados de um post: o PNG vai ser compartilhado
  return toPublic(
    { ...draft, id: "card", family: report.family, wallet: report.wallet, target, caption, signature: "", respects: 0, respectedBy: [], createdAt: Date.now(), example: report.demo },
    "",
  );
}

type Move = { from: number; to: number; fromLabel: string; toLabel: string };

/** Candles da venda até hoje (inventados no exemplo); sem eles o card usa a linha de dois pontos. */
async function candlesFor(loss: PublicLoss, move: Move | null): Promise<Candle[]> {
  if (loss.kind !== "missed" || !move || !loss.tokenAddress || !loss.lastSellAt) return [];
  if (loss.example) return demoCandles(loss.tokenAddress, loss.lastSellAt, move.from, move.to);
  return fetchCandles(loss.chain, loss.tokenAddress, loss.lastSellAt, loss.pool);
}

function Chart({ candles, move, sellAt, w, h }: { candles: Candle[]; move: Move; sellAt?: number; w: number; h: number }) {
  if (candlesMatch(candles, move.to) && sellAt) {
    const plot = plotCandles(candles, sellAt, move.from, { x: 10, y: 14, w: w - 20, h: h - 30 });
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <line x1="0" x2={w} y1={h - 4} y2={h - 4} stroke={C.line} strokeWidth="2" />
        <line x1={plot.sell.x} x2={w} y1={plot.sell.y} y2={plot.sell.y} stroke={C.dim} strokeOpacity="0.5" strokeWidth="2" strokeDasharray="6 8" />
        <line x1={plot.sell.x} x2={plot.sell.x} y1="4" y2={h - 4} stroke={C.dim} strokeOpacity="0.25" strokeWidth="2" strokeDasharray="4 6" />
        {plot.bars.map((b, i) => {
          const color = b.up ? C.gain : C.loss;
          return [
            <line key={`w${i}`} x1={b.x} x2={b.x} y1={b.high} y2={b.low} stroke={color} strokeWidth={Math.max(1.5, b.w * 0.14)} />,
            <rect key={`b${i}`} x={b.x - b.w / 2} y={Math.min(b.open, b.close)} width={b.w} height={Math.max(2, Math.abs(b.close - b.open))} fill={color} />,
          ];
        })}
        <circle cx={plot.sell.x} cy={plot.sell.y} r="10" fill={C.dim} stroke={C.raise} strokeWidth="4" />
        <circle cx={plot.last.x} cy={plot.last.y} r="11" fill={C.loss} stroke={C.raise} strokeWidth="4" />
      </svg>
    );
  }
  // Gráfico de dois pontos, igual ao do site: linha reta, área entre a linha e o preço de partida
  const up = move.to >= move.from;
  const x1 = 20, x2 = w - 20, y1 = up ? h - 30 : 30, y2 = up ? 30 : h - 30;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <line x1="0" x2={w} y1={h - 8} y2={h - 8} stroke={C.line} strokeWidth="2" />
      <line x1={x1} x2={x2} y1={y1} y2={y1} stroke={C.dim} strokeOpacity="0.45" strokeWidth="2" strokeDasharray="6 8" />
      <path d={`M${x1} ${y1} L${x2} ${y2} L${x2} ${y1} Z`} fill="rgba(255,109,116,0.18)" />
      <path d={`M${x1} ${y1} L${x2} ${y2}`} fill="none" stroke={C.loss} strokeWidth="5" strokeLinecap="round" />
      <circle cx={x1} cy={y1} r="10" fill={C.dim} stroke={C.raise} strokeWidth="4" />
      <circle cx={x2} cy={y2} r="12" fill={C.loss} stroke={C.raise} strokeWidth="4" />
    </svg>
  );
}

export async function GET(req: NextRequest) {
  const loss = await resolveLoss(req);
  if (loss instanceof NextResponse) return loss;
  const wide = req.nextUrl.searchParams.get("layout") === "wide";
  const [W, H] = wide ? [1600, 900] : [1080, 1350];

  const chain = CHAINS[loss.chain];
  const { level, name: tier } = tierOf(loss.amountUsd);
  const sym = `$${loss.token.toUpperCase()}`;
  const summary = loss.kind === "wallet" || loss.kind === "total";
  const title = summary ? `${loss.tokensCount ?? "Several"} tokens` : sym;
  const network = summary ? (loss.family === "solana" ? "Solana" : "EVM") : chain.name;
  const qty = loss.soldAmount ?? 0;
  const move: Move | null =
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
        : loss.kind === "total"
          ? `Everything left on the table plus every realized loss, across ${loss.tokensCount} tokens.`
          : loss.kind === "realized"
            ? "Bought high, sold low"
            : "";
  const story =
    loss.kind === "missed" && move
      ? `Sold ${amount(qty)} for ${money(loss.soldUsd!)}. Worth ${money(loss.valueNowUsd!)} today.`
      : loss.kind === "realized" && move
        ? `Paid ${money(loss.boughtUsd!)} and got back ${money(loss.soldUsd!)}.`
        : "";
  const candles = await candlesFor(loss, move);

  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #b9a7ff, #ff94b8)" }} />
        <div style={{ display: "flex", fontSize: 28, fontWeight: 700 }}>
          LossPorn<span style={{ color: "#d9b3e0" }}>Hub</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: C.raise, border: `1px solid ${C.line}`, fontSize: 22, color: C.dim }}>
        <div style={{ width: 10, height: 10, borderRadius: 999, background: chain.color }} />
        {network}
      </div>
    </div>
  );

  const token = (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 84, height: 84, borderRadius: 999, background: gradientOf(loss.token), color: "#17131f", fontSize: 36, fontWeight: 700 }}>
        {loss.token.slice(0, 1).toUpperCase()}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 24, color: C.dim }}>{loss.lastSellAt ? `Sold on ${date(loss.lastSellAt)}` : network}</div>
      </div>
    </div>
  );

  const number = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: C.loss }}>{KIND[loss.kind]}</div>
      <div style={{ display: "flex", fontSize: wide ? 112 : 128, fontWeight: 700, letterSpacing: -6, lineHeight: 1 }}>{painUsd(loss.kind, loss.amountUsd)}</div>
      {sub && <div style={{ display: "flex", fontSize: 28, color: C.dim, marginTop: 6, lineHeight: 1.3 }}>{sub}</div>}
    </div>
  );

  const panel = { display: "flex", flexDirection: "column" as const, padding: 44, borderRadius: 40, background: C.card, border: `1px solid ${C.edge}` };
  // No horizontal o gráfico é a coluna da direita inteira; no vertical, um bloco dentro do card
  const chartW = wide ? 744 : 800;
  const chartH = wide ? 360 : 180;
  const chartPanel = move && (
    <div style={{ ...(wide ? { ...panel, flex: 1, padding: 36 } : { display: "flex", flexDirection: "column", padding: 32, borderRadius: 28, background: C.raise, marginTop: 44 }), gap: 18 }}>
      {wide && <div style={{ display: "flex", fontSize: 24, color: C.dim }}>{loss.kind === "missed" ? "Token price since the sell" : "Token price"}</div>}
      <Chart candles={candles} move={move} sellAt={loss.lastSellAt} w={chartW} h={chartH} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: C.dim }}>{move.fromLabel}</span>
          <span style={{ fontWeight: 600 }}>{price(move.from)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <span style={{ color: C.dim }}>{move.toLabel}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
            {price(move.to)}
            {loss.kind === "missed" && loss.multiple ? (
              <span style={{ padding: "2px 12px", borderRadius: 999, background: "rgba(255,109,116,0.15)", color: C.loss, fontSize: 20 }}>{multiple(loss.multiple)}</span>
            ) : null}
          </div>
        </div>
      </div>
      {story && <div style={{ display: "flex", paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 24, color: C.dim }}>{story}</div>}
    </div>
  );

  // Loss porn total: as duas partes da soma, no lugar do gráfico
  const breakdown = loss.kind === "total" && (
    <div style={{ ...(wide ? { ...panel, flex: 1, padding: 28 } : { display: "flex", marginTop: 44 }), gap: 20 }}>
      {[
        { label: "Left on the table", value: money(loss.missedUsd ?? 0), note: "What the tokens you sold are worth today, minus what you got" },
        { label: "Realized loss", value: usd(loss.realizedLossUsd ?? 0), note: "What you paid above what you got back" },
      ].map((x) => (
        <div key={x.label} style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, padding: 32, borderRadius: 28, background: C.raise }}>
          <span style={{ fontSize: 24, color: C.dim }}>{x.label}</span>
          <span style={{ fontSize: wide ? 72 : 56, fontWeight: 700, letterSpacing: -2, color: C.loss }}>{x.value}</span>
          <span style={{ fontSize: 22, color: C.dim, lineHeight: 1.3 }}>{x.note}</span>
        </div>
      ))}
    </div>
  );

  const caption = loss.caption && (
    <div style={{ display: "flex", gap: 14, marginTop: 32, padding: "22px 28px", borderRadius: 24, border: `1px solid ${C.line}`, fontSize: wide ? 24 : 28, lineHeight: 1.35 }}>
      <span style={{ color: C.lilac, fontSize: 44, lineHeight: 0.8 }}>“</span>
      <span>{loss.caption}</span>
    </div>
  );

  const meter = (
    <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: "auto", paddingTop: 36 }}>
      <div style={{ display: "flex", flex: 1, gap: 6 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ height: 10, flex: 1, borderRadius: 999, background: i <= level ? C.loss : "rgba(255,109,116,0.15)" }} />
        ))}
      </div>
      <div style={{ display: "flex", fontSize: 24 }}>
        <span style={{ fontWeight: 600 }}>{tier}</span>
        <span style={{ color: C.dim }}>&nbsp;· level {level} of 5</span>
      </div>
    </div>
  );

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, fontSize: 22, color: C.dim }}>
      <span>{loss.example ? "Example card" : "Numbers read straight from the blockchain"}</span>
      <span>How much would you have if you hadn't sold?</span>
    </div>
  );

  const wallet = loss.kind === "wallet" && wide && (
    <div style={{ ...panel, flex: 1, alignItems: "center", justifyContent: "center", fontSize: 30, color: C.dim, lineHeight: 1.4, textAlign: "center" }}>
      {`Sold ${loss.tokensCount} tokens too early. The worst one was ${sym}.`}
    </div>
  );

  const png = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: wide ? 56 : 64,
          background: "linear-gradient(160deg, #1a1626 0%, #0e0d12 55%, #1c1119 100%)",
          color: C.fg,
          fontFamily: "sans-serif",
        }}
      >
        {header}
        {wide ? (
          <div style={{ display: "flex", flex: 1, gap: 28, marginTop: 32 }}>
            <div style={{ ...panel, width: 640 }}>
              {token}
              <div style={{ display: "flex", marginTop: 36 }}>{number}</div>
              {caption}
              {meter}
            </div>
            {chartPanel || breakdown || wallet}
          </div>
        ) : (
          <div style={{ ...panel, flex: 1, marginTop: 40 }}>
            {token}
            <div style={{ display: "flex", marginTop: 44 }}>{number}</div>
            {chartPanel || breakdown}
            {caption}
            {meter}
          </div>
        )}
        {footer}
      </div>
    ),
    { width: W, height: H },
  );

  const file = `losspornhub-${summary ? loss.kind : loss.token.toLowerCase()}${wide ? "-wide" : ""}.png`;
  png.headers.set("Content-Disposition", `attachment; filename="${file}"`);
  png.headers.set("Cache-Control", "no-store");
  return png;
}
