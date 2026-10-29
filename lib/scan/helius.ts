import { ENV_WHERE, ScanError } from "./errors";
import { NATIVE, swapFromLegs, type Leg } from "./legs";
import type { Swap } from "./types";

/**
 * Solana via Helius (plano Free: 1 milhão de créditos por mês, sem cartão).
 * O histórico já vem interpretado: a gente só lê o que saiu e entrou na carteira em cada swap.
 */
const HOST = "https://api.helius.xyz";
const RPC = "https://mainnet.helius-rpc.com";
const WSOL = NATIVE.solana.address;

type RawTx = {
  signature: string;
  timestamp: number;
  fee?: number;
  feePayer?: string;
  transactionError?: unknown;
  tokenTransfers?: { fromUserAccount?: string; toUserAccount?: string; tokenAmount?: number; mint?: string }[];
  nativeTransfers?: { fromUserAccount?: string; toUserAccount?: string; amount?: number }[];
  accountData?: { account?: string; nativeBalanceChange?: number }[];
};

function legsOf(wallet: string, raw: RawTx): Leg[] {
  const legs: Leg[] = [];
  for (const t of raw.tokenTransfers ?? []) {
    const amount = Number(t.tokenAmount);
    // SOL embrulhado entra pela variação de saldo abaixo, senão conta duas vezes
    if (!t.mint || t.mint === WSOL || !(amount > 0)) continue;
    const token = { address: t.mint, symbol: "", name: "", amount };
    if (t.fromUserAccount === wallet) legs.push({ ...token, side: "out" });
    if (t.toUserAccount === wallet) legs.push({ ...token, side: "in" });
  }

  // SOL: variação líquida da carteira na transação, devolvendo a taxa que ela pagou
  const me = raw.accountData?.find((a) => a.account === wallet);
  let lamports: number;
  if (me) {
    lamports = Number(me.nativeBalanceChange ?? 0);
    if (raw.feePayer === wallet) lamports += Number(raw.fee ?? 0);
  } else {
    lamports = 0;
    for (const n of raw.nativeTransfers ?? []) {
      if (n.fromUserAccount === wallet) lamports -= Number(n.amount ?? 0);
      if (n.toUserAccount === wallet) lamports += Number(n.amount ?? 0);
    }
  }
  const sol = lamports / 1e9;
  if (Math.abs(sol) >= 0.0005) {
    legs.push({ address: WSOL, symbol: "SOL", name: "Solana", amount: Math.abs(sol), side: sol > 0 ? "in" : "out" });
  }
  return legs;
}

/** Swaps mais recentes da carteira, até `maxPages` × 100. */
export async function fetchSolanaSwaps(wallet: string, apiKey: string, maxPages = 5) {
  const swaps: Swap[] = [];
  let unpriced = 0;
  let before: string | undefined;
  let cursorParam = "before";
  let page = 0;

  while (page < maxPages) {
    const url = new URL(`${HOST}/v0/addresses/${wallet}/transactions`);
    url.searchParams.set("api-key", apiKey);
    url.searchParams.set("type", "SWAP");
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set(cursorParam, before);

    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
    if (res.status === 401 || res.status === 403)
      throw new ScanError(`Helius rejected the API key. Check HELIUS_API_KEY in ${ENV_WHERE}.`, 500, "bad_key");
    if (res.status === 429) throw new ScanError("Helius rate limit reached. Try again in a few minutes.", 429, "rate_limited");
    // Versões da API chamam o cursor de nomes diferentes
    if (res.status === 400 && before && cursorParam === "before") {
      cursorParam = "before-signature";
      continue;
    }
    if (!res.ok) throw new ScanError(`Helius responded ${res.status}.`);

    const list = (await res.json()) as RawTx[];
    if (!Array.isArray(list) || list.length === 0) {
      before = undefined;
      break;
    }
    for (const raw of list) {
      if (raw.transactionError || !raw.signature) continue;
      const r = await swapFromLegs("solana", raw.signature, Number(raw.timestamp) * 1000, legsOf(wallet, raw));
      if (r === "unpriced") unpriced++;
      else if (r) swaps.push(...r);
    }
    before = list[list.length - 1].signature;
    page++;
    if (list.length < 100) {
      before = undefined;
      break;
    }
  }

  return { swaps, truncated: Boolean(before), unpriced };
}

export type AssetMeta = { symbol: string; name: string; logo: string | null };

/** Nome e logo dos tokens pelo DAS da Helius, para o que a DexScreener não conhece (token morto, por exemplo). */
export async function fetchSolanaMetadata(mints: string[], apiKey: string): Promise<Map<string, AssetMeta>> {
  const out = new Map<string, AssetMeta>();
  for (let i = 0; i < mints.length; i += 100) {
    const ids = mints.slice(i, i + 100);
    try {
      const res = await fetch(`${RPC}/?api-key=${apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "meta", method: "getAssetBatch", params: { ids } }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        result?: ({ id?: string; content?: { metadata?: { symbol?: string; name?: string }; links?: { image?: string } } } | null)[];
      };
      for (const a of data.result ?? []) {
        if (!a?.id) continue;
        const symbol = a.content?.metadata?.symbol?.trim();
        if (!symbol) continue;
        out.set(a.id, { symbol: symbol.slice(0, 20), name: a.content?.metadata?.name?.trim() || "", logo: a.content?.links?.image || null });
      }
    } catch {
      continue;
    }
  }
  return out;
}
