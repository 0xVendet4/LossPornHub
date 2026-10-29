import { CHAINS, EVM_CHAINS, detectFamily, walletKey, type ChainKey } from "../chains";
import { ENV_WHERE, GRACE, ScanError } from "./errors";
import { ALCHEMY_SLUG, fetchAlchemySwaps } from "./alchemy";
import { PAID_ONLY, fetchEvmSwaps } from "./etherscan";
import { fetchSolanaMetadata, fetchSolanaSwaps } from "./helius";
import { addrKey, currentPrices, type Quote } from "./prices";
import { buildReport } from "./report";
import { demoReport } from "./demo";
import type { Report, Swap } from "./types";
import { hashIp, scanStore } from "../scan-cache";

export { ScanError };

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { report: Report; at: number }>();
const inflight = new Map<string, Promise<Report>>();

// Raios-x novos (sem cache) por IP a cada 10 min: um pico de acesso não esgota a Etherscan e a Alchemy
const LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;

type Options = {
  /** Encurta o prazo do raio-x (só para baixo), para testar o site de fora; esse resultado não vai para o cache. */
  budgetMs?: number;
  /** IP de quem pediu, para o limite. Sem IP (chamada interna, PC) não há limite. */
  ip?: string;
};

export async function scanWallet(address: string, { budgetMs, ip }: Options = {}): Promise<Report> {
  if (address === "demo") return demoReport();

  const family = detectFamily(address);
  if (!family) throw new ScanError("Invalid address. Paste an EVM (0x…) or Solana address.", 400, "bad_address");

  if (budgetMs) {
    await allow(ip);
    return run(address, family, Math.min(budgetMs, 25_000));
  }

  const key = walletKey(address);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.report;
  // Guardado no banco vale para todas as instâncias da função
  const saved = await scanStore.get(key, TTL_MS).catch(() => null);
  if (saved) {
    cache.set(key, { report: saved, at: saved.scannedAt });
    return saved;
  }
  if (inflight.has(key)) return inflight.get(key)!;

  await allow(ip);
  const job = run(address, family)
    .then(async (report) => {
      cache.set(key, { report, at: report.scannedAt });
      await scanStore.set(key, report).catch((e) => console.error("scan cache:", e));
      return report;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** Conta o raio-x novo desse IP; se o banco falhar, deixa passar. */
async function allow(ip?: string) {
  if (!ip) return;
  const count = await scanStore.hit(hashIp(ip), WINDOW_MS).catch(() => 0);
  if (count > LIMIT)
    throw new ScanError(
      "Too many scans from your connection. Wait a few minutes and try again. Wallets scanned in the last 15 minutes still load instantly.",
      429,
      "rate_limited",
    );
}

async function run(wallet: string, family: "evm" | "solana", budgetMs = 25_000): Promise<Report> {
  // Redes que a Etherscan grátis não cobre vão pela Alchemy, se tiver chave; sem ela, as que a Etherscan
  // já recusou ficam de fora sem gastar chamada
  const alchemyKey = family === "evm" ? process.env.ALCHEMY_API_KEY : undefined;
  const viaAlchemy = (c: ChainKey) => !!alchemyKey && !!ALCHEMY_SLUG[c];
  const paidChains: ChainKey[] = family === "evm" ? EVM_CHAINS.filter((c) => PAID_ONLY.has(c) && !viaAlchemy(c)) : [];
  const chains: ChainKey[] = family === "evm" ? EVM_CHAINS.filter((c) => !paidChains.includes(c)) : ["solana"];
  // A função da Vercel tem 60 s e, se passar, devolve erro sem explicação. O raio-x para de paginar em 25 s
  // e usa o que já leu; a rede que ainda não terminou em 37 s fica de fora. Depois ainda vem o preço de hoje.
  const deadline = Date.now() + budgetMs;
  const cutoff = <T,>(job: Promise<T>, c: ChainKey) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ScanError(`${CHAINS[c].name} has too much history to read in time.`, 504, "slow_chain")), deadline + GRACE - Date.now());
    });
    return Promise.race([job, stop]).finally(() => clearTimeout(timer));
  };
  const apiKey = family === "evm" ? process.env.ETHERSCAN_API_KEY : process.env.HELIUS_API_KEY;
  if (!apiKey)
    throw new ScanError(
      family === "evm"
        ? `ETHERSCAN_API_KEY is missing in ${ENV_WHERE}, so EVM wallets can't be read.`
        : `HELIUS_API_KEY is missing in ${ENV_WHERE}, so Solana wallets can't be read.`,
      503,
      "no_key"
    );

  // Quanto cada etapa levou, em ms: aparece no ?trace=1 da API para entender raio-x lento no site
  const t0 = Date.now();
  const timing: Record<string, number> = {};
  const timed = <T,>(job: Promise<T>, name: string) => job.finally(() => (timing[name] = Date.now() - t0));
  const results = await Promise.allSettled(
    chains.map((c) =>
      timed(
        cutoff(
          c === "solana"
            ? fetchSolanaSwaps(wallet, apiKey, deadline)
            : viaAlchemy(c)
              ? fetchAlchemySwaps(c, wallet, alchemyKey!, deadline)
              : fetchEvmSwaps(c, wallet, apiKey, deadline),
          c,
        ),
        c,
      ),
    ),
  );

  const swaps: Swap[] = [];
  const failedChains: ChainKey[] = [];
  let truncated = false;
  // Numa rede cortada no prazo, o swap mais antigo lido marca de quando em diante o histórico está completo
  let completeSince: number | undefined;
  let unpricedSwaps = 0;
  let firstError: unknown;
  const failedReasons: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      swaps.push(...r.value.swaps);
      truncated ||= r.value.truncated;
      if (r.value.truncated && r.value.swaps.length) completeSince = Math.max(completeSince ?? 0, Math.min(...r.value.swaps.map((s) => s.at)));
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

  timing.prices = Date.now() - t0;

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
    completeSince,
    paidChains,
    failedReasons,
    timing: { ...timing, total: Date.now() - t0 },
  };
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
