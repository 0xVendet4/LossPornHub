import type { Candle } from "./candles";

export type Bar = { x: number; w: number; open: number; close: number; high: number; low: number; up: boolean };

export type CandlePlot = {
  bars: Bar[];
  /** Preço → y. Escala log quando o token subiu ou caiu muito, para os candles do começo não virarem um risco. */
  y: (price: number) => number;
  sell: { x: number; y: number };
  last: { x: number; y: number; price: number };
  /** Máxima depois da venda (pavio mais alto), se houver candle depois dela. */
  peak: { x: number; y: number; price: number; at: number } | null;
};

type Box = { x: number; y: number; w: number; h: number };

/**
 * Posição de cada candle numa caixa. Usado pelo gráfico do site (SVG), pelo card em PNG e pelo vídeo (canvas),
 * então tudo sai com o mesmo desenho.
 */
export function plotCandles(cs: Candle[], sellAt: number, sellPrice: number, box: Box): CandlePlot {
  const lo = Math.min(sellPrice, ...cs.map((c) => c.l));
  const hi = Math.max(sellPrice, ...cs.map((c) => c.h));
  const log = hi / lo > 6;
  const f = (p: number) => (log ? Math.log(p) : p);
  const pad = (f(hi) - f(lo)) * 0.06 || Math.abs(f(hi)) * 0.05 || 1;
  const top = f(hi) + pad;
  const bottom = f(lo) - pad;
  const y = (p: number) => box.y + ((top - f(p)) / (top - bottom)) * box.h;

  const n = cs.length;
  const slot = box.w / n;
  const w = Math.max(1, slot * 0.62);
  const cx = (i: number) => box.x + (i + 0.5) * slot;
  const bars = cs.map((c, i) => ({ x: cx(i), w, open: y(c.o), close: y(c.c), high: y(c.h), low: y(c.l), up: c.c >= c.o }));

  // Onde a venda cai entre os candles (fração do índice), presa dentro da caixa
  const step = n > 1 ? (cs[n - 1].t - cs[0].t) / (n - 1) : 1;
  const idx = (sellAt - cs[0].t) / step;
  const sx = Math.min(box.x + box.w, Math.max(box.x, cx(idx)));

  const high = peakAfter(cs, sellAt);
  return {
    bars,
    y,
    sell: { x: sx, y: y(sellPrice) },
    last: { x: cx(n - 1), y: y(cs[n - 1].c), price: cs[n - 1].c },
    peak: high && { x: cx(high.i), y: y(high.price), price: high.price, at: high.at },
  };
}

/** O candle de máxima mais alta depois da venda: até onde o token foi depois que a pessoa vendeu. */
export function peakAfter(cs: Candle[], sellAt: number) {
  let best: { i: number; price: number; at: number } | null = null;
  cs.forEach((c, i) => {
    if (c.t >= sellAt && (!best || c.h > best.price)) best = { i, price: c.h, at: c.t };
  });
  return best as { i: number; price: number; at: number } | null;
}

/** O pico só vale ser mostrado quando ficou bem acima do preço de hoje; senão repete o "hoje". */
export const peakWorthShowing = (peak: number | undefined, nowPrice: number) => !!peak && peak > nowPrice * 1.15;

/**
 * Os candles batem com o preço de hoje? Se o último fechamento estiver longe do preço da DexScreener,
 * a GeckoTerminal devolveu outro lado do par ou outro pool: melhor o gráfico simples do que um errado.
 */
export const candlesMatch = (cs: Candle[], nowPrice: number) => {
  if (cs.length < 3 || !(nowPrice > 0)) return false;
  const ratio = cs[cs.length - 1].c / nowPrice;
  return ratio > 0.5 && ratio < 2;
};
