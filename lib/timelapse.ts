import type { Candle } from "./candles";
import { plotCandles } from "./candle-plot";
import { date, money, multiple, price } from "./format";

/**
 * Quadro do vídeo timelapse: os candles vão aparecendo da venda até hoje e o valor deixado na mesa sobe junto.
 * Desenhado num canvas e gravado pelo navegador (components/VideoMaker.tsx).
 */
export type Scene = {
  candles: Candle[];
  sellAt: number;
  sellPrice: number;
  symbol: string;
  chainName: string;
  chainColor: string;
  amountUsd: number;
  soldAmount: number;
  soldUsd: number;
  host: string;
  fonts: { display: string; sans: string };
  /** Candle de máxima depois da venda, quando ficou bem acima de hoje: o vídeo para nele e mostra quanto valia. */
  peak?: { i: number; price: number; at: number };
};

export const INTRO = 0.6;
export const REVEAL = 5.8;
export const PAUSE = 1.8;
export const HOLD = 2.6;
export const durationOf = (s: Scene) => INTRO + REVEAL + (s.peak ? PAUSE : 0) + HOLD;

/**
 * Quanto dos candles já apareceu (0 a 1) no tempo t. Com pico, a revelação desacelera até ele, fica parada
 * PAUSE segundos e depois segue até hoje; `atPeak` é o quanto a pausa está visível (0 a 1, com fade).
 */
function progress(s: Scene, t: number) {
  const tr = t - INTRO;
  if (!s.peak) return { reveal: smooth(clamp(tr / REVEAL)), atPeak: 0, pastPeak: false };
  const p = (s.peak.i + 1) / s.candles.length;
  const a = Math.max(0.001, REVEAL * p);
  const b = Math.max(0.001, REVEAL - a);
  const reveal = tr < a ? p * smooth(clamp(tr / a)) : tr < a + PAUSE ? p : p + (1 - p) * smooth(clamp((tr - a - PAUSE) / b));
  const fade = 0.25;
  const atPeak = tr < a || tr > a + PAUSE ? 0 : Math.min(1, (tr - a) / fade, (a + PAUSE - tr) / fade);
  return { reveal, atPeak, pastPeak: tr >= a };
}

const C = {
  bg1: "#1a1626",
  bg2: "#0e0d12",
  bg3: "#1c1119",
  card: "#17161d",
  raise: "#211f29",
  line: "#2b2934",
  edge: "#3a3450",
  fg: "#f4f2f8",
  dim: "#9b97a9",
  lilac: "#b9a7ff",
  rose: "#ff94b8",
  loss: "#ff6d74",
  gain: "#62e0a8",
};

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const smooth = (x: number) => x * x * (3 - 2 * x);

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, font: string, fg: string, bg: string, align: "left" | "right" = "left") {
  ctx.font = `600 ${size}px ${font}`;
  const w = ctx.measureText(text).width + size * 1.1;
  const h = size * 1.7;
  const left = align === "left" ? x : x - w;
  ctx.fillStyle = bg;
  roundRect(ctx, left, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, left + size * 0.55, y + 1);
  return w;
}

export function drawFrame(ctx: CanvasRenderingContext2D, W: number, H: number, s: Scene, t: number) {
  const wide = W > H;
  const P = wide ? 80 : 64;
  const { display, sans } = s.fonts;

  // Fundo
  const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
  g.addColorStop(0, C.bg1);
  g.addColorStop(0.55, C.bg2);
  g.addColorStop(1, C.bg3);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = smooth(clamp(t / INTRO));

  // Marca e carteira
  const hy = P + 22;
  const brand = ctx.createLinearGradient(P, hy - 20, P + 40, hy + 20);
  brand.addColorStop(0, C.lilac);
  brand.addColorStop(1, C.rose);
  ctx.fillStyle = brand;
  roundRect(ctx, P, hy - 20, 40, 40, 12);
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `700 30px ${display}`;
  ctx.fillStyle = C.fg;
  ctx.fillText("LossPorn", P + 56, hy + 1);
  ctx.fillStyle = "#d9b3e0";
  ctx.fillText("Hub", P + 56 + ctx.measureText("LossPorn").width, hy + 1);
  ctx.font = `500 24px ${sans}`;
  const tag = s.chainName;
  const tw = ctx.measureText(tag).width;
  ctx.fillStyle = C.raise;
  roundRect(ctx, W - P - tw - 64, hy - 24, tw + 64, 48, 24);
  ctx.fill();
  ctx.fillStyle = s.chainColor;
  ctx.beginPath();
  ctx.arc(W - P - tw - 36, hy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.dim;
  ctx.fillText(tag, W - P - tw - 20, hy + 1);

  // Colunas: no vertical tudo empilhado, no horizontal texto à esquerda e gráfico à direita
  const textX = P;
  const top = wide ? 220 : 170;
  const chart = wide ? { x: 860, y: 170, w: W - 860 - P, h: H - 170 - 150 } : { x: P, y: 560, w: W - 2 * P, h: H - 560 - 150 };

  // Token
  const r = 42;
  const avatar = ctx.createLinearGradient(textX, top, textX + 2 * r, top + 2 * r);
  avatar.addColorStop(0, C.lilac);
  avatar.addColorStop(1, "#6f5ae6");
  ctx.fillStyle = avatar;
  ctx.beginPath();
  ctx.arc(textX + r, top + r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#17131f";
  ctx.font = `700 36px ${display}`;
  ctx.textAlign = "center";
  ctx.fillText(s.symbol.slice(0, 1).toUpperCase(), textX + r, top + r + 2);
  ctx.textAlign = "left";
  ctx.fillStyle = C.fg;
  ctx.font = `700 46px ${display}`;
  ctx.fillText(`$${s.symbol.toUpperCase()}`, textX + 2 * r + 22, top + r - 16);
  ctx.fillStyle = C.dim;
  ctx.font = `400 26px ${sans}`;
  ctx.fillText(`Sold on ${date(s.sellAt)}`, textX + 2 * r + 22, top + r + 26);

  // Candles na caixa do gráfico
  // Sobra espaço à direita para a etiqueta do preço não cobrir os últimos candles
  const box = { x: chart.x + 44, y: chart.y + 70, w: chart.w - 44 - 200, h: chart.h - 130 };
  const plot = plotCandles(s.candles, s.sellAt, s.sellPrice, box);
  const n = s.candles.length;
  const slot = box.w / n;
  const { reveal, atPeak, pastPeak } = progress(s, t);
  const f = reveal * n;
  const full = Math.floor(f);
  const frac = f - full;
  const lastClose = s.candles[n - 1].c;

  // Preço do momento: o fechamento do candle que está aparecendo
  let cur = s.candles[0].o;
  if (full >= n) cur = lastClose;
  else if (full > 0 || frac > 0) {
    const c = s.candles[Math.min(full, n - 1)];
    cur = full < n ? c.o + (c.c - c.o) * frac : c.c;
  }
  const revealX = box.x + Math.min(f, n) * slot;
  const sold = revealX >= plot.sell.x;
  const value = !sold
    ? 0
    : lastClose > s.sellPrice
      ? Math.max(0, (s.amountUsd * (cur - s.sellPrice)) / (lastClose - s.sellPrice))
      : Math.max(0, s.soldAmount * cur - s.soldUsd);
  const shown = reveal >= 1 ? s.amountUsd : value;
  const peakWorth = s.peak ? Number(((s.soldUsd * s.peak.price) / s.sellPrice).toPrecision(3)) : 0;

  // Título e número. Na pausa do pico, o número vira quanto o que foi vendido valia no topo
  const ly = top + (wide ? 190 : 150);
  const mult = cur / s.sellPrice;
  const pulse = t > durationOf(s) - HOLD ? 1 + 0.025 * Math.sin((t - durationOf(s) + HOLD) * 5) : 1;
  const headline = (alpha: number, title: string, color: string, n: number, sub: string) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.font = `600 32px ${sans}`;
    ctx.fillText(title, textX, ly);
    ctx.save();
    ctx.translate(textX, ly + (wide ? 110 : 100));
    ctx.scale(pulse, pulse);
    ctx.fillStyle = C.fg;
    ctx.font = `700 ${wide ? 150 : 136}px ${display}`;
    ctx.fillText(money(n), -4, 0);
    ctx.restore();
    ctx.fillStyle = C.dim;
    ctx.font = `400 30px ${sans}`;
    ctx.fillText(sub, textX, ly + (wide ? 200 : 180));
    ctx.restore();
  };
  headline(1 - atPeak, "Left on the table", C.loss, shown, sold && mult > 1 ? `Up ${multiple(mult)} since you sold` : "Watch what happened after the sell");
  if (s.peak) headline(atPeak, "Worth at the peak", C.lilac, peakWorth, `${date(s.peak.at)} · ${multiple(s.peak.price / s.sellPrice)} above your sell`);
  if (wide) {
    ctx.fillStyle = C.dim;
    ctx.font = `400 30px ${sans}`;
    ctx.fillText(`Sold ${money(s.soldUsd)} worth of $${s.symbol.toUpperCase()}.`, textX, ly + 300);
    ctx.fillText(`It'd be worth ${money(s.soldUsd + shown)} now.`, textX, ly + 345);
    if (s.peak && pastPeak) ctx.fillText(`At the peak it was worth ${money(peakWorth)}.`, textX, ly + 390);
  }

  // Painel do gráfico
  ctx.fillStyle = C.card;
  roundRect(ctx, chart.x, chart.y, chart.w, chart.h, 32);
  ctx.fill();
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = C.dim;
  ctx.font = `500 24px ${sans}`;
  ctx.fillText("Token price", chart.x + 44, chart.y + 40);

  // Linhas de grade
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 3; i++) {
    const y = box.y + (box.h * i) / 3;
    ctx.beginPath();
    ctx.moveTo(box.x, y);
    ctx.lineTo(box.x + box.w, y);
    ctx.stroke();
  }

  // Candles até onde o tempo chegou
  for (let i = 0; i < Math.min(n, full + 1); i++) {
    const b = plot.bars[i];
    let { open, close, high, low } = b;
    if (i === full) {
      if (frac <= 0) break;
      const c = s.candles[i];
      const partial = c.o + (c.c - c.o) * frac;
      close = plot.y(partial);
      high = Math.min(open, close) - (Math.min(b.open, b.close) - b.high) * frac;
      low = Math.max(open, close) + (b.low - Math.max(b.open, b.close)) * frac;
    }
    const color = close <= open ? C.gain : C.loss;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, b.w * 0.14);
    ctx.beginPath();
    ctx.moveTo(b.x, high);
    ctx.lineTo(b.x, low);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(b.x - b.w / 2, Math.min(open, close), b.w, Math.max(2, Math.abs(close - open)));
  }

  // Onde vendeu
  if (sold) {
    ctx.setLineDash([8, 10]);
    ctx.strokeStyle = "rgba(155,151,169,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plot.sell.x, plot.sell.y);
    ctx.lineTo(Math.max(plot.sell.x, revealX), plot.sell.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(155,151,169,0.3)";
    ctx.beginPath();
    ctx.moveTo(plot.sell.x, box.y);
    ctx.lineTo(plot.sell.x, box.y + box.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.dim;
    ctx.strokeStyle = C.card;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(plot.sell.x, plot.sell.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const below = plot.sell.y < box.y + 70;
    pill(ctx, `You sold here · ${price(s.sellPrice)}`, Math.min(plot.sell.x + 18, box.x + box.w - 300), plot.sell.y + (below ? 44 : -44), 22, sans, C.fg, C.raise);
  }

  // Pico: ponto lilás desde que o candle dele apareceu; na pausa, a etiqueta com o valor
  if (s.peak && plot.peak && pastPeak) {
    const { x, y } = plot.peak;
    ctx.fillStyle = C.lilac;
    ctx.strokeStyle = C.card;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // À esquerda do ponto, na mesma altura: o pico é o ponto mais alto, então ali os candles estão mais baixos
    // e a etiqueta não briga com a do preço de hoje, na borda direita
    ctx.font = `600 22px ${sans}`;
    const label = `Peak · ${money(peakWorth)}`;
    const w = ctx.measureText(label).width + 24;
    const px = Math.max(box.x, x - 22 - w);
    const py = px === box.x ? y - 40 : y;
    pill(ctx, label, px, py, 22, sans, atPeak > 0 ? "#17131f" : C.lilac, atPeak > 0 ? C.lilac : "rgba(185,167,255,0.16)");
  }

  // Preço do momento, na borda direita
  if (reveal > 0) {
    const y = plot.y(cur);
    ctx.setLineDash([4, 8]);
    ctx.strokeStyle = "rgba(255,109,116,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(revealX, y);
    ctx.lineTo(box.x + box.w + 12, y);
    ctx.stroke();
    ctx.setLineDash([]);
    const right = chart.x + chart.w - 28;
    pill(ctx, price(cur), right, y, 24, sans, "#17131f", C.loss, "right");
    if (sold && mult > 1) pill(ctx, multiple(mult), right, y + (y > box.y + box.h - 40 ? -46 : 46), 22, sans, C.loss, "rgba(255,109,116,0.16)", "right");
  }

  // Rodapé
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.dim;
  ctx.font = `500 26px ${sans}`;
  ctx.textAlign = "left";
  ctx.fillText(s.host, P, H - P + 10);
  ctx.textAlign = "right";
  ctx.fillText("How much would you have if you hadn't sold?", W - P, H - P + 10);
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}
