import { ENV_WHERE, ScanError, until } from "./errors";
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

/**
 * Swaps da carteira, dos mais recentes para trás, até o prazo do raio-x ou `maxPages` chamadas
 * (cada uma custa 100 créditos da Helius). Com o filtro de tipo, a Helius olha uma janela de transações
 * por chamada: uma página pode vir com menos de 100 swaps, ou vazia com "continue daqui", e ainda haver
 * swaps mais antigos. Só para quando a lista acaba de verdade.
 */
export async function fetchSolanaSwaps(wallet: string, apiKey: string, deadline: number, maxPages = 25) {
  const swaps: Swap[] = [];
  let unpriced = 0;
  let before: string | undefined;
  let cursorParam = "before-signature";
  let more = true;

  for (let page = 0; more && page < maxPages; page++) {
    if (Date.now() > deadline) break;
    const url = new URL(`${HOST}/v0/addresses/${wallet}/transactions`);
    url.searchParams.set("api-key", apiKey);
    url.searchParams.set("type", "SWAP");
    url.searchParams.set("sort-order", "desc");
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set(cursorParam, before);

    const res = await fetch(url, { cache: "no-store", signal: until(deadline, 25_000) });
    if (res.status === 401 || res.status === 403)
      throw new ScanError(`Helius rejected the API key. Check HELIUS_API_KEY in ${ENV_WHERE}.`, 500, "bad_key");
    if (res.status === 429) throw new ScanError("Helius rate limit reached. Try again in a few minutes.", 429, "rate_limited");
    const body = (await res.json().catch(() => null)) as RawTx[] | { error?: string } | null;

    // Nenhum swap nessa janela: a Helius diz de qual assinatura continuar
    const error = body && !Array.isArray(body) ? String(body.error ?? "") : "";
    if (/failed to find events/i.test(error)) {
      const next = error.match(/parameter set to ([1-9A-HJ-NP-Za-km-z]{32,})/)?.[1];
      if (!next) break;
      before = next;
      continue;
    }
    // Versões da API chamam o cursor de nomes diferentes
    if (res.status === 400 && before && cursorParam === "before-signature") {
      cursorParam = "before";
      page--;
      continue;
    }
    if (!res.ok || !Array.isArray(body)) throw new ScanError(`Helius responded ${res.status}.`);

    if (body.length === 0) {
      more = false;
      break;
    }
    for (const raw of body) {
      if (raw.transactionError || !raw.signature) continue;
      const r = await swapFromLegs("solana", raw.signature, Number(raw.timestamp) * 1000, legsOf(wallet, raw));
      if (r === "unpriced") unpriced++;
      else if (r) swaps.push(...r);
    }
    before = body[body.length - 1].signature;
  }

  return { swaps, truncated: more, unpriced };
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
