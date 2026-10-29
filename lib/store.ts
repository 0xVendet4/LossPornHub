import crypto from "crypto";
import { walletKey, type ChainKey } from "./chains";
import { authorOf } from "./author";
import { fuzz, toPublic as publicView } from "./privacy";
import type { Loss, LossKind, PublicLoss } from "./types";
import { fileBackend } from "./store-file";
import { neonQuery, pgBackend } from "./store-pg";

/** Posts que resumem a carteira inteira: ficam fora das somas, senão o mesmo prejuízo contaria duas vezes. */
const SUMMARY = new Set<LossKind>(["wallet", "total"]);

/**
 * Onde os posts ficam guardados. Com DATABASE_URL (Neon na Vercel) é Postgres;
 * sem ela, o arquivo data/losses.json de sempre, para rodar no PC.
 */
export type Backend = {
  /** Todos os posts, com a contagem de F preenchida. */
  all(): Promise<Loss[]>;
  /** false quando a carteira já postou esse mesmo alvo. */
  insert(loss: Loss): Promise<boolean>;
  /** Nova contagem de F, ou null se o post não existe. */
  respect(id: string, voter: string): Promise<number | null>;
  /** Apaga o post e os F dele. */
  remove(id: string): Promise<void>;
};

export const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

export function createStore(backend: Backend) {
  const toPublic = (l: Loss): PublicLoss => publicView(l, l.example ? "example" : authorOf(l.wallet));

  async function listLosses(sort: Sort = "new", limit = 50): Promise<PublicLoss[]> {
    const all = [...(await backend.all())];
    if (sort === "top") all.sort((a, b) => b.amountUsd - a.amountUsd);
    else if (sort === "respects") all.sort((a, b) => b.respects - a.respects);
    else all.sort((a, b) => b.createdAt - a.createdAt);
    return all.slice(0, limit).map(toPublic);
  }

  /** Posts de um apelido (uma carteira), mais recentes primeiro. */
  async function authorLosses(author: string): Promise<PublicLoss[]> {
    return (await backend.all())
      .filter((l) => !l.example && authorOf(l.wallet) === author)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toPublic);
  }

  async function getLoss(id: string): Promise<PublicLoss | null> {
    const l = (await backend.all()).find((x) => x.id === id);
    return l ? toPublic(l) : null;
  }

  async function addLoss(input: NewLoss): Promise<PublicLoss | "duplicate"> {
    const loss: Loss = {
      ...input,
      id: crypto.randomBytes(6).toString("base64url"),
      respects: 0,
      respectedBy: [],
      createdAt: Date.now(),
    };
    return (await backend.insert(loss)) ? toPublic(loss) : "duplicate";
  }

  /** Só a carteira que postou apaga. A conferência da assinatura fica com quem chama. */
  async function deleteLoss(id: string, wallet: string): Promise<"deleted" | "not_found" | "not_owner"> {
    const l = (await backend.all()).find((x) => x.id === id);
    if (!l || l.example) return "not_found";
    if (walletKey(l.wallet) !== walletKey(wallet)) return "not_owner";
    await backend.remove(id);
    return "deleted";
  }

  async function payRespects(id: string, voter: string): Promise<number | null> {
    const key = crypto.createHash("sha256").update(voter).digest("hex").slice(0, 16);
    return backend.respect(id, key);
  }

  /**
   * Ranking pelo maior vacilo de cada carteira. O total soma só posts por token (os resumos repetiriam valores).
   * `since` deixa só os posts a partir dessa hora; `chain`, só os dessa rede (num resumo, a do pior token).
   */
  async function leaderboard(limit = 50, filter: { since?: number; chain?: ChainKey } = {}): Promise<LeaderRow[]> {
    const rows = new Map<string, LeaderRow>();
    for (const l of await backend.all()) {
      if ((filter.since && l.createdAt < filter.since) || (filter.chain && l.chain !== filter.chain)) continue;
      const k = walletKey(l.wallet);
      const r = rows.get(k) ?? { author: l.example ? "example" : authorOf(l.wallet), chain: l.chain, family: l.family, total: 0, count: 0, biggest: 0, biggestKind: "missed", biggestToken: "", biggestSymbol: "" };
      if (!SUMMARY.has(l.kind)) r.total += l.amountUsd;
      r.count++;
      if (l.amountUsd > r.biggest) {
        r.biggest = l.amountUsd;
        r.biggestKind = l.kind;
        r.biggestToken = SUMMARY.has(l.kind) ? "whole wallet" : `$${l.token.toUpperCase()}`;
        r.biggestLogo = l.logo;
        r.biggestSymbol = l.token;
        r.chain = l.chain;
      }
      rows.set(k, r);
    }
    return [...rows.values()]
      .sort((a, b) => b.biggest - a.biggest)
      .slice(0, limit)
      .map((r) => ({ ...r, total: fuzz(r.total)!, biggest: fuzz(r.biggest)! }));
  }

  /** O maior post dos últimos 7 dias, sem contar os exemplos. */
  async function fumbleOfWeek(): Promise<PublicLoss | null> {
    const since = Date.now() - 7 * 86_400_000;
    const best = (await backend.all())
      .filter((l) => !l.example && l.createdAt >= since)
      .reduce<Loss | null>((m, l) => (!m || l.amountUsd > m.amountUsd ? l : m), null);
    return best ? toPublic(best) : null;
  }

  async function stats() {
    const all = await backend.all();
    let total = 0, evm = 0, sol = 0, respects = 0;
    let biggest: Loss | null = null;
    const wallets = new Set<string>();
    for (const l of all) {
      if (!SUMMARY.has(l.kind)) {
        total += l.amountUsd;
        if (l.family === "solana") sol += l.amountUsd;
        else evm += l.amountUsd;
      }
      respects += l.respects;
      wallets.add(walletKey(l.wallet));
      if (!biggest || l.amountUsd > biggest.amountUsd) biggest = l;
    }
    return { total, count: all.length, wallets: wallets.size, respects, evm, sol, biggest: biggest ? toPublic(biggest) : null };
  }

  return { listLosses, authorLosses, getLoss, addLoss, deleteLoss, payRespects, leaderboard, fumbleOfWeek, stats };
}

export type Sort = "new" | "top" | "respects";
export type NewLoss = Omit<Loss, "id" | "respects" | "respectedBy" | "createdAt">;
export type LeaderRow = { author: string; chain: string; family: string; total: number; count: number; biggest: number; biggestKind: LossKind; biggestToken: string; biggestSymbol: string; biggestLogo?: string };

const store = createStore(DB_URL ? pgBackend(neonQuery(DB_URL)) : fileBackend());
export const { listLosses, authorLosses, getLoss, addLoss, deleteLoss, payRespects, leaderboard, fumbleOfWeek, stats } = store;
