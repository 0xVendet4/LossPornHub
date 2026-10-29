import { EVM_CHAINS, detectFamily, walletKey, type ChainKey } from "../chains";
import { ENV_WHERE, ScanError } from "./errors";
import { ALCHEMY_SLUG, fetchAlchemySwaps } from "./alchemy";
import { PAID_ONLY, fetchEvmSwaps } from "./etherscan";
import { fetchSolanaMetadata, fetchSolanaSwaps } from "./helius";
import { addrKey, currentPrices, type Quote } from "./prices";
import { buildReport } from "./report";
import { demoReport } from "./demo";
import type { Report, Swap } from "./types";

export { ScanError };

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { report: Report; at: number }>();
const inflight = new Map<string, Promise<Report>>();

export async function scanWallet(address: string): Promise<Report> {
  if (address === "demo") return demoReport();

  const family = detectFamily(address);
  if (!family) throw new ScanError("Invalid address. Paste an EVM (0x…) or Solana address.", 400, "bad_address");

  const key = walletKey(address);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.report;
  if (inflight.has(key)) return inflight.get(key)!;

  const job = run(address, family).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function run(wallet: string, family: "evm" | "solana"): Promise<Report> {
  // Redes que a Etherscan grátis não cobre vão pela Alchemy, se tiver chave; sem ela, as que a Etherscan
  // já recusou ficam de fora sem gastar chamada
  const alchemyKey = family === "evm" ? process.env.ALCHEMY_API_KEY : undefined;
  const viaAlchemy = (c: ChainKey) => !!alchemyKey && !!ALCHEMY_SLUG[c];
  const paidChains: ChainKey[] = family === "evm" ? EVM_CHAINS.filter((c) => PAID_ONLY.has(c) && !viaAlchemy(c)) : [];
  const chains: ChainKey[] = family === "evm" ? EVM_CHAINS.filter((c) => !paidChains.includes(c)) : ["solana"];
  // A função da Vercel tem 60 s; o raio-x EVM para de paginar em 30 s e usa o que já leu
  // (chamadas em andamento ainda têm alguns segundos, e depois vem o preço de hoje)
  const deadline = Date.now() + 30_000;
  const apiKey = family === "evm" ? process.env.ETHERSCAN_API_KEY : process.env.HELIUS_API_KEY;
  if (!apiKey)
    throw new ScanError(
      family === "evm"
        ? `ETHERSCAN_API_KEY is missing in ${ENV_WHERE}, so EVM wallets can't be read.`
        : `HELIUS_API_KEY is missing in ${ENV_WHERE}, so Solana wallets can't be read.`,
      503,
      "no_key"
    );

  const results = await Promise.allSettled(
    chains.map((c) =>
      c === "solana"
        ? fetchSolanaSwaps(wallet, apiKey)
        : viaAlchemy(c)
          ? fetchAlchemySwaps(c, wallet, alchemyKey!, deadline)
          : fetchEvmSwaps(c, wallet, apiKey, deadline),
    ),
  );

  const swaps: Swap[] = [];
  const failedChains: ChainKey[] = [];
  let truncated = false;
  let unpricedSwaps = 0;
  let firstError: unknown;
  const failedReasons: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      swaps.push(...r.value.swaps);
      truncated ||= r.value.truncated;
      unpricedSwaps += r.value.unpriced;
    } else if (r.reason instanceof ScanError && r.reason.code === "paid_chain") {
      paidChains.push(chains[i]);
    } else {
      failedChains.push(chains[i]);
      firstError ??= r.reason;
      const why = r.reason instanceof ScanError ? r.reason.message : "Unexpected error.";
      if (!failedReasons.includes(why)) failedReasons.push(why);
    }
  });
  const read = chains.filter((c) => !failedChains.includes(c) && !paidChains.includes(c));
  if (read.length === 0) throw firstError ?? new ScanError("None of the EVM networks we read are on the free Etherscan plan.", 402, "paid_chain");

  // Preço atual só dos tokens vendidos, agrupados por rede
  const byChain = new Map<ChainKey, string[]>();
  for (const s of swaps) {
    if (s.type !== "sell") continue;
    byChain.set(s.chain, [...(byChain.get(s.chain) ?? []), s.token.address]);
  }
  const prices = new Map<string, Quote>();
  await Promise.all(
    [...byChain].map(async ([chain, addrs]) => {
      const found = await currentPrices(chain, addrs);
      found.forEach((p, a) => prices.set(`${chain}:${addrKey(chain, a)}`, p));
    })
  );

  if (family === "solana") await fillSolanaMetadata(swaps, prices, apiKey);
  else {
    // A Alchemy às vezes não sabe o símbolo do token: usa o da DexScreener ou o começo do endereço
    for (const s of swaps) if (!s.token.symbol) s.token.symbol = (prices.get(`${s.chain}:${addrKey(s.chain, s.token.address)}`)?.symbol || s.token.address.slice(0, 6)).slice(0, 20);
  }

  const report: Report = {
    ...buildReport({
      family,
      wallet,
      chains: read,
      failedChains,
      swaps,
      truncated,
      prices,
    }),
    unpricedSwaps,
    paidChains,
    failedReasons,
  };
  cache.set(walletKey(wallet), { report, at: Date.now() });
  return report;
}

/** Na Solana a transação só traz o mint: símbolo e logo vêm da DexScreener ou, se ela não conhece, da Helius. */
async function fillSolanaMetadata(swaps: Swap[], prices: Map<string, Quote>, apiKey: string) {
  const missing = new Set<string>();
  for (const s of swaps) {
    if (s.type === "sell" && !s.token.symbol && !prices.get(`solana:${s.token.address}`)?.symbol) missing.add(s.token.address);
  }
  const meta = missing.size > 0 ? await fetchSolanaMetadata([...missing], apiKey) : new Map();
  for (const s of swaps) {
    if (s.token.symbol) continue;
    const q = prices.get(`solana:${s.token.address}`);
    const m = meta.get(s.token.address);
    s.token.symbol = (q?.symbol || m?.symbol || s.token.address.slice(0, 6)).slice(0, 20);
    s.token.name = q?.name || m?.name || "";
    s.token.logo = m?.logo || q?.logo || null;
  }
}
