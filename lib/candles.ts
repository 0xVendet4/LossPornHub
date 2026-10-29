import type { ChainKey } from "./chains";
import { addrKey } from "./scan/prices";

/** Um candle em USD; `t` é o início do período, em ms. */
export type Candle = { t: number; o: number; h: number; l: number; c: number };

/**
 * Candles do token pela GeckoTerminal (grátis, sem chave, 30 chamadas por minuto).
 * O pool é o par de maior liquidez na DexScreener. O período de cada candle depende de quanto tempo
 * passou desde a venda, para o gráfico ter algumas dezenas deles: de hora em hora para uma venda de ontem,
 * diário para uma de meses atrás.
 */
const NETWORK: Record<ChainKey, string> = {
  ethereum: "eth",
  base: "base",
  arbitrum: "arbitrum",
  optimism: "optimism",
  polygon: "polygon_pos",
  bsc: "bsc",
  robinhood: "robinhood",
  solana: "solana",
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MAX_CANDLES = 80;
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; candles: Candle[] }>();

export async function findPool(chain: ChainKey, token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${token}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const pairs = (await res.json()) as { pairAddress?: string; liquidity?: { usd?: number } }[];
    let best: { pool: string; liq: number } | null = null;
    for (const p of Array.isArray(pairs) ? pairs : []) {
      const liq = p.liquidity?.usd ?? 0;
      if (p.pairAddress && (!best || liq > best.liq)) best = { pool: p.pairAddress, liq };
    }
    return best?.pool ?? null;
  } catch {
    return null;
  }
}

function frame(since: number) {
  const span = Math.max(Date.now() - since, HOUR);
  if (span <= 2 * DAY) return { tf: "hour", agg: 1, step: HOUR };
  if (span <= 8 * DAY) return { tf: "hour", agg: 4, step: 4 * HOUR };
  if (span <= 25 * DAY) return { tf: "hour", agg: 12, step: 12 * HOUR };
  return { tf: "day", agg: 1, step: DAY };
}

/** Do pouco antes da venda até agora. Lista vazia quando o token não tem pool ou a GeckoTerminal não respondeu. */
export async function fetchCandles(chain: ChainKey, token: string, since: number, pool?: string | null): Promise<Candle[]> {
  return (await candlesWithReason(chain, token, since, pool)).candles;
}

/** Igual a `fetchCandles`, com o motivo quando não vem nada (a rota devolve, para dar para depurar pelo navegador). */
export async function candlesWithReason(chain: ChainKey, token: string, since: number, pool?: string | null): Promise<{ candles: Candle[]; reason?: string }> {
  const { tf, agg, step } = frame(since);
  // Um trecho antes da venda dá contexto: dá para ver de onde o preço vinha
  const from = since - Math.max((Date.now() - since) * 0.15, 4 * step);
  const key = `${chain}:${addrKey(chain, token)}:${tf}${agg}:${Math.floor(from / step)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { candles: hit.candles };

  const found = pool || (await findPool(chain, token));
  if (!found) return { candles: [], reason: "no pool on DexScreener" };
  const p = chain === "solana" ? found : found.toLowerCase();
  const limit = Math.min(1000, Math.ceil((Date.now() - from) / step) + 1);
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${NETWORK[chain]}/pools/${p}/ohlcv/${tf}?aggregate=${agg}&limit=${limit}&currency=usd&token=${token}`,
      { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return { candles: [], reason: `geckoterminal ${res.status}: ${(await res.text()).slice(0, 160)}` };
    const data = (await res.json()) as { data?: { attributes?: { ohlcv_list?: (number | string)[][] } } };
    const rows = data.data?.attributes?.ohlcv_list ?? [];
    const candles = rows
      .map(([t, o, h, l, c]) => ({ t: Number(t) * 1000, o: Number(o), h: Number(h), l: Number(l), c: Number(c) }))
      .filter((x) => x.t >= from - step && x.o > 0 && x.h > 0 && x.l > 0 && x.c > 0)
      .sort((a, b) => a.t - b.t);
    const out = merge(candles, MAX_CANDLES);
    if (out.length > 0) cache.set(key, { at: Date.now(), candles: out });
    return out.length > 0 ? { candles: out } : { candles: [], reason: `geckoterminal returned ${rows.length} rows, none after the sell` };
  } catch (e) {
    return { candles: [], reason: `geckoterminal failed: ${(e as Error).message}` };
  }
}

/** Junta candles vizinhos até caber em `max`, para o gráfico não virar uma parede de palitos. */
function merge(cs: Candle[], max: number): Candle[] {
  if (cs.length <= max) return cs;
  const size = Math.ceil(cs.length / max);
  const out: Candle[] = [];
  for (let i = 0; i < cs.length; i += size) {
    const g = cs.slice(i, i + size);
    out.push({ t: g[0].t, o: g[0].o, c: g[g.length - 1].c, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)) });
  }
  return out;
}

/**
 * Candles inventados para a carteira de exemplo: o preço passeia em volta do preço de venda e depois
 * vai até o preço de "hoje" do exemplo. A semente é o token, então o desenho é sempre o mesmo.
 */
export function demoCandles(token: string, since: number, sellPrice: number, nowPrice: number): Candle[] {
  let seed = [...token].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = 64;
  const pre = 9;
  const start = since - ((Date.now() - since) * pre) / (n - pre);
  const step = (Date.now() - start) / n;
  const a = Math.log(sellPrice);
  const b = Math.log(nowPrice);
  const vol = Math.max(0.04, Math.abs(b - a) / 14);

  // Passeio aleatório preso nas duas pontas (ponte browniana) depois da venda
  const walk = [0];
  for (let i = 1; i < n - pre; i++) walk.push(walk[i - 1] + (rand() - 0.5) * 2 * vol);
  const drift = walk[walk.length - 1];
  const logs = [
    ...Array.from({ length: pre }, (_, i) => a + (rand() - 0.5) * vol * 2 + ((pre - i) / pre) * -vol * 1.5),
    ...walk.map((w, i) => a + ((b - a) * i) / (walk.length - 1) + w - (drift * i) / (walk.length - 1)),
  ];

  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const o = Math.exp(i === 0 ? logs[0] - vol / 2 : logs[i - 1]);
    const c = Math.exp(logs[i]);
    const h = Math.max(o, c) * Math.exp(rand() * vol * 0.8);
    const l = Math.min(o, c) / Math.exp(rand() * vol * 0.8);
    out.push({ t: Math.round(start + i * step), o, h, l, c });
  }
  return out;
}
