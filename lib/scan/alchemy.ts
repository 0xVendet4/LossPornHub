import type { ChainKey } from "../chains";
import { ENV_WHERE, ScanError, late, sleep, until } from "./errors";
import { NATIVE, swapFromLegs, type Leg } from "./legs";
import type { Swap } from "./types";

/**
 * Redes que a Etherscan grátis não cobre (Base, BNB, Optimism, Robinhood Chain), lidas pela Alchemy
 * (plano Free: 30 milhões de CUs por mês, 300 CUs por segundo, uma chave para todas as redes).
 *
 * As transferências vêm do Transfers API. O ETH que um router devolve numa venda é uma transferência interna,
 * e a Alchemy só lista internas em algumas redes; nas outras, a venda aparece como "token saiu, nada entrou".
 * Para essas, o quanto entrou de ETH sai da diferença de saldo da carteira entre o bloco anterior e o da venda.
 * O gás não entra na conta: nessas redes custa centavos.
 */
export const ALCHEMY_SLUG: Partial<Record<ChainKey, string>> = {
  base: "base-mainnet",
  optimism: "opt-mainnet",
  bsc: "bnb-mainnet",
  robinhood: "robinhood-mainnet",
};

// Redes onde o Transfers API lista transferências internas; nas outras, diferença de saldo
const INTERNAL = new Set<ChainKey>(["base"]);
const MAX_PAGES = 3;
const MAX_BALANCE_LOOKUPS = 48;

// Fila global: cada página do Transfers API custa ~150 CUs e o plano grátis aguenta 300 por segundo
let last = 0;
let queue: Promise<unknown> = Promise.resolve();
function throttled<T>(gap: number, deadline: number, fn: () => Promise<T>): Promise<T> {
  // A fila só espaça o começo das chamadas: uma resposta lenta numa rede não segura as outras
  const turn = queue.then(async () => {
    // O raio-x já desistiu desta rede: sai da fila sem esperar, para não atrasar o próximo
    if (late(deadline)) throw new ScanError("Out of time.", 504, "slow_chain");
    const wait = last + gap - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  });
  queue = turn.catch(() => undefined);
  return turn.then(fn);
}

const NAME: Partial<Record<ChainKey, string>> = { base: "Base", optimism: "Optimism", bsc: "BNB Chain", robinhood: "Robinhood Chain" };

type RpcCall = { method: string; params: unknown[] };
type RpcReply = { id?: number; result?: unknown; error?: { code?: number; message?: string } };

async function rpc(chain: ChainKey, apiKey: string, calls: RpcCall[], gap: number, deadline: number): Promise<unknown[]> {
  const body = calls.map((c, id) => ({ jsonrpc: "2.0", id, ...c }));
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await throttled(gap, deadline, () =>
      fetch(`https://${ALCHEMY_SLUG[chain]}.g.alchemy.com/v2/${apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body.length === 1 ? body[0] : body),
        cache: "no-store",
        signal: until(deadline),
      }),
    );
    const text = await res.text();
    if (res.status === 429 || /exceeded|capacity|rate limit/i.test(text.slice(0, 300))) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (res.status === 401 || /must be authenticated|invalid api key|unauthorized/i.test(text.slice(0, 300)))
      throw new ScanError(`Alchemy rejected the API key. Check ALCHEMY_API_KEY in ${ENV_WHERE}.`, 500, "bad_key");
    if (res.status === 403 || /not enabled|not allowed|is not available/i.test(text.slice(0, 300)))
      throw new ScanError(
        `${NAME[chain]} isn't turned on in your Alchemy app. Turn it on in the Alchemy dashboard, under Networks. (Alchemy said: "${said(text)}")`,
        502,
        "chain_disabled",
      );
    if (!res.ok) throw new ScanError(`Alchemy responded ${res.status} for ${NAME[chain]}.`);

    const parsed = JSON.parse(text) as RpcReply | RpcReply[];
    const replies = (Array.isArray(parsed) ? parsed : [parsed]).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const err = replies.find((r) => r.error)?.error;
    if (err) {
      if (err.code === 429) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw new ScanError(`Alchemy said "${err.message}" for ${NAME[chain]}.`);
    }
    return replies.map((r) => r.result);
  }
  throw new ScanError("Alchemy rate limit reached. Try again in a minute.", 429, "rate_limited");
}

/** A mensagem de erro da própria Alchemy, curta e sem links (que trazem o id do app), para saber o motivo exato. */
function said(text: string) {
  let msg = text;
  try {
    const j = JSON.parse(text);
    msg = (Array.isArray(j) ? j.find((r) => r?.error)?.error?.message : j?.error?.message) || text;
  } catch {}
  return msg.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
}

type Transfer = {
  blockNum: string;
  hash: string;
  from: string | null;
  to: string | null;
  asset: string | null;
  category: string;
  rawContract?: { value?: string | null; address?: string | null; decimal?: string | null };
  metadata?: { blockTimestamp?: string };
};

async function transfers(chain: ChainKey, wallet: string, apiKey: string, side: "fromAddress" | "toAddress", deadline: number) {
  const rows: Transfer[] = [];
  let pageKey: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (Date.now() > deadline) return { rows, truncated: true };
    const category = INTERNAL.has(chain) ? ["external", "internal", "erc20"] : ["external", "erc20"];
    const params = { fromBlock: "0x0", toBlock: "latest", [side]: wallet, category, withMetadata: true, excludeZeroValue: true, maxCount: "0x3e8", order: "desc", ...(pageKey ? { pageKey } : {}) };
    let result: { transfers?: Transfer[]; pageKey?: string };
    try {
      [result] = (await rpc(chain, apiKey, [{ method: "alchemy_getAssetTransfers", params: [params] }], 520, deadline)) as [typeof result];
    } catch (e) {
      // Rede sem transferências internas no Transfers API: tenta de novo sem, e a diferença de saldo cobre o ETH
      if (e instanceof ScanError && /internal/i.test(e.message) && category.includes("internal")) {
        INTERNAL.delete(chain);
        page--;
        continue;
      }
      throw e;
    }
    rows.push(...(result.transfers ?? []));
    pageKey = result.pageKey;
    if (!pageKey) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** Valor bruto → quantidade, sem perder precisão em tokens de 18 casas. Aceita negativo (diferença de saldo). */
function units(raw: bigint | string | null | undefined, decimals: number): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const v = typeof raw === "bigint" ? raw : BigInt(raw);
  if (v < 0n) return -units(-v, decimals);
  const base = 10n ** BigInt(decimals);
  return Number(v / base) + Number(v % base) / Number(base);
}

export async function fetchAlchemySwaps(chain: ChainKey, wallet: string, apiKey: string, deadline = Date.now() + 30_000) {
  const me = wallet.toLowerCase();
  const [out, inc] = await Promise.all([transfers(chain, wallet, apiKey, "fromAddress", deadline), transfers(chain, wallet, apiKey, "toAddress", deadline)]);
  let truncated = out.truncated || inc.truncated;

  const native = NATIVE[chain];
  const byTx = new Map<string, { at: number; block: number; legs: Leg[] }>();
  for (const t of [...out.rows, ...inc.rows]) {
    const isToken = t.category === "erc20";
    if (!isToken && t.category !== "external" && t.category !== "internal") continue;
    const decimals = isToken ? (t.rawContract?.decimal ? Number(BigInt(t.rawContract.decimal)) : 18) : 18;
    const amount = units(t.rawContract?.value, decimals);
    if (!(amount > 0) || (isToken && !t.rawContract?.address)) continue;
    const coin = isToken
      ? { address: t.rawContract!.address!, symbol: (t.asset || "").slice(0, 20), name: "", amount }
      : { address: native.address, symbol: native.symbol, name: native.name, amount };
    const e = byTx.get(t.hash) ?? { at: Date.parse(t.metadata?.blockTimestamp ?? "") || 0, block: parseInt(t.blockNum, 16), legs: [] };
    byTx.set(t.hash, e);
    // A mesma transferência aparece nas duas listas quando a carteira manda para ela mesma: conta uma vez só
    const side = t.from?.toLowerCase() === me ? "out" : t.to?.toLowerCase() === me ? "in" : null;
    if (!side || e.legs.some((l) => l.side === side && l.address === coin.address && l.amount === amount)) continue;
    e.legs.push({ ...coin, side });
  }

  // Vendas por ETH sem a transferência interna à vista: token saiu e nada entrou
  if (!INTERNAL.has(chain)) {
    const pending = [...byTx.entries()]
      .filter(([, e]) => e.legs.some((l) => l.side === "out" && l.address !== native.address) && !e.legs.some((l) => l.side === "in"))
      .sort((a, b) => b[1].block - a[1].block);
    if (pending.length > MAX_BALANCE_LOOKUPS) truncated = true;
    for (let i = 0; i < Math.min(pending.length, MAX_BALANCE_LOOKUPS); i += 8) {
      if (Date.now() > deadline) {
        truncated = true;
        break;
      }
      const chunk = pending.slice(i, i + 8);
      const calls = chunk.flatMap(([, e]) => [
        { method: "eth_getBalance", params: [wallet, `0x${(e.block - 1).toString(16)}`] },
        { method: "eth_getBalance", params: [wallet, `0x${e.block.toString(16)}`] },
      ]);
      const balances = (await rpc(chain, apiKey, calls, 650, deadline)) as string[];
      chunk.forEach(([, e], j) => {
        const sent = e.legs.filter((l) => l.side === "out" && l.address === native.address).reduce((n, l) => n + l.amount, 0);
        const got = units(BigInt(balances[2 * j + 1]) - BigInt(balances[2 * j]), 18) + sent;
        if (got > 1e-9) e.legs.push({ address: native.address, symbol: native.symbol, name: native.name, amount: got, side: "in" });
      });
    }
  }

  const swaps: Swap[] = [];
  let unpriced = 0;
  for (const [hash, { at, legs }] of byTx) {
    if (!legs.some((l) => l.side === "out") || !legs.some((l) => l.side === "in")) continue;
    const r = await swapFromLegs(chain, hash, at, legs);
    if (r === "unpriced") unpriced++;
    else if (r) swaps.push(...r);
  }
  return { swaps, truncated, unpriced };
}
