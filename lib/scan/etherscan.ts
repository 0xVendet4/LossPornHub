import type { ChainKey } from "../chains";
import { ScanError, sleep } from "./errors";
import { NATIVE, swapFromLegs, type Leg } from "./legs";
import type { Swap } from "./types";

/**
 * Redes EVM via Etherscan (plano Free: 3 chamadas por segundo, 100 mil por dia, uma chave para todas as redes).
 * Não existe endpoint de swap: a gente junta as transferências de token, o ETH enviado e o ETH recebido
 * de cada transação e vê o que saiu e o que entrou.
 */
const BASE = "https://api.etherscan.io/v2/api";

const CHAIN_ID: Partial<Record<ChainKey, number>> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  bsc: 56,
};

// Fila global com espaçamento, para respeitar o limite do plano grátis
let last = 0;
let queue: Promise<unknown> = Promise.resolve();
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = last + 350 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

type Row = Record<string, string>;

async function call(chain: ChainKey, params: Record<string, string | number>, apiKey: string): Promise<Row[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = new URL(BASE);
    url.searchParams.set("chainid", String(CHAIN_ID[chain]));
    url.searchParams.set("module", "account");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    url.searchParams.set("apikey", apiKey);

    const res = await throttled(() => fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) }));
    if (res.status === 429) {
      await sleep(1200);
      continue;
    }
    if (!res.ok) throw new ScanError(`Etherscan responded ${res.status} for ${chain}.`);

    const data = (await res.json()) as { status?: string; message?: string; result?: unknown };
    if (Array.isArray(data.result)) return data.result as Row[];
    const text = String(data.result ?? data.message ?? "");
    if (/rate limit/i.test(text)) {
      await sleep(1200);
      continue;
    }
    if (/api key/i.test(text)) throw new ScanError("Etherscan rejected the API key. Check ETHERSCAN_API_KEY in .env.local.", 500, "bad_key");
    if (/no transactions found|no records found/i.test(`${data.message} ${text}`)) return [];
    throw new ScanError(`Etherscan responded "${text || data.message}" for ${chain}.`);
  }
  throw new ScanError("Etherscan rate limit reached. Try again in a few minutes.", 429, "rate_limited");
}

/** Páginas mais recentes primeiro, até `maxPages` × `offset` registros. */
async function pages(chain: ChainKey, action: string, wallet: string, apiKey: string, offset: number, maxPages: number) {
  const rows: Row[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const got = await call(chain, { action, address: wallet, page, offset, sort: "desc", startblock: 0, endblock: 99_999_999 }, apiKey);
    rows.push(...got);
    if (got.length < offset) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export async function fetchEvmSwaps(chain: ChainKey, wallet: string, apiKey: string) {
  const me = wallet.toLowerCase();
  const tokens = await pages(chain, "tokentx", wallet, apiKey, 1000, 3);
  if (tokens.rows.length === 0) return { swaps: [] as Swap[], truncated: false, unpriced: 0 };

  const normal = await pages(chain, "txlist", wallet, apiKey, 1000, 2);
  const internal = await pages(chain, "txlistinternal", wallet, apiKey, 1000, 2);

  const byTx = new Map<string, { at: number; legs: Leg[] }>();
  const entry = (hash: string, ts: string) => {
    const e = byTx.get(hash) ?? { at: Number(ts) * 1000, legs: [] };
    byTx.set(hash, e);
    return e;
  };

  for (const t of tokens.rows) {
    const amount = Number(t.value) / 10 ** Number(t.tokenDecimal || 18);
    if (!(amount > 0) || !t.contractAddress) continue;
    const token = { address: t.contractAddress, symbol: (t.tokenSymbol || "???").slice(0, 20), name: t.tokenName || "", amount };
    if (t.from?.toLowerCase() === me) entry(t.hash, t.timeStamp).legs.push({ ...token, side: "out" });
    if (t.to?.toLowerCase() === me) entry(t.hash, t.timeStamp).legs.push({ ...token, side: "in" });
  }

  const native = NATIVE[chain];
  for (const x of [...normal.rows, ...internal.rows]) {
    if (x.isError !== "0") continue;
    const amount = Number(x.value) / 1e18;
    if (!(amount > 0)) continue;
    const coin = { address: native.address, symbol: native.symbol, name: native.name, amount };
    if (x.from?.toLowerCase() === me) entry(x.hash, x.timeStamp).legs.push({ ...coin, side: "out" });
    if (x.to?.toLowerCase() === me) entry(x.hash, x.timeStamp).legs.push({ ...coin, side: "in" });
  }

  const swaps: Swap[] = [];
  let unpriced = 0;
  for (const [hash, { at, legs }] of byTx) {
    // Swap tem algo saindo e algo entrando
    if (!legs.some((l) => l.side === "out") || !legs.some((l) => l.side === "in")) continue;
    const r = await swapFromLegs(chain, hash, at, legs);
    if (r === "unpriced") unpriced++;
    else if (r) swaps.push(...r);
  }
  return { swaps, truncated: tokens.truncated, unpriced };
}
