/**
 * Preço diário histórico das moedas que aparecem do outro lado dos swaps (SOL, ETH, BNB, POL).
 * É com ele que a gente sabe quantos dólares uma venda rendeu no dia.
 * Fontes sem chave: Binance (candles diários) e, se ela falhar, CryptoCompare.
 */
export type Coin = "ETH" | "BNB" | "POL" | "SOL";

const BINANCE: Record<Coin, string> = { ETH: "ETHUSDT", BNB: "BNBUSDT", POL: "POLUSDT", SOL: "SOLUSDT" };
const CRYPTOCOMPARE: Record<Coin, string> = { ETH: "ETH", BNB: "BNB", POL: "POL", SOL: "SOL" };

const DAY = 86_400_000;
const TTL_MS = 6 * 60 * 60 * 1000;

/** dia (início em UTC, ms) → fechamento em USD */
type Series = Map<number, number>;

const cache = new Map<Coin, { series: Series; at: number }>();
const inflight = new Map<Coin, Promise<Series>>();

// Cada chamada precisa do seu próprio timeout: um AbortSignal criado uma vez no módulo vence e aborta tudo depois
const opts = () => ({ cache: "no-store" as const, signal: AbortSignal.timeout(15_000) });

async function fromBinance(symbol: string): Promise<Series> {
  const series: Series = new Map();
  let end = Date.now();
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&endTime=${end}&limit=1000`, opts());
    if (!res.ok) throw new Error(`binance ${res.status}`);
    const rows = (await res.json()) as unknown[];
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows as (string | number)[][]) series.set(Number(r[0]), Number(r[4]));
    if (rows.length < 1000) break;
    end = Number((rows[0] as (string | number)[])[0]) - 1;
  }
  return series;
}

async function fromCryptoCompare(fsym: string): Promise<Series> {
  const series: Series = new Map();
  let toTs = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`https://min-api.cryptocompare.com/data/v2/histoday?fsym=${fsym}&tsym=USD&limit=2000&toTs=${toTs}`, opts());
    if (!res.ok) throw new Error(`cryptocompare ${res.status}`);
    const data = (await res.json()) as { Data?: { Data?: { time: number; close: number }[] } };
    const rows = data.Data?.Data;
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) if (r.close > 0) series.set(r.time * 1000, r.close);
    toTs = rows[0].time - 86_400;
  }
  return series;
}

async function load(coin: Coin): Promise<Series> {
  let series: Series = new Map();
  try {
    series = await fromBinance(BINANCE[coin]);
  } catch {}
  if (series.size === 0) {
    try {
      series = await fromCryptoCompare(CRYPTOCOMPARE[coin]);
    } catch {}
  }
  // MATIC virou POL em setembro de 2024: o histórico de antes fica no símbolo antigo
  if (coin === "POL") {
    try {
      const old = await fromCryptoCompare("MATIC");
      old.forEach((p, d) => {
        if (!series.has(d)) series.set(d, p);
      });
    } catch {}
  }
  return series;
}

function getSeries(coin: Coin): Promise<Series> {
  const hit = cache.get(coin);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.series);
  if (inflight.has(coin)) return inflight.get(coin)!;
  const job = load(coin)
    .then((series) => {
      if (series.size > 0) cache.set(coin, { series, at: Date.now() });
      return series;
    })
    .finally(() => inflight.delete(coin));
  inflight.set(coin, job);
  return job;
}

/** Fechamento do dia da transação (ou do dia vizinho, se faltar). `null` quando não há histórico. */
export async function priceAt(coin: Coin, ts: number): Promise<number | null> {
  const series = await getSeries(coin);
  if (series.size === 0) return null;
  const day = Math.floor(ts / DAY) * DAY;
  for (const d of [day, day - DAY, day + DAY]) {
    const p = series.get(d);
    if (p) return p;
  }
  return null;
}
