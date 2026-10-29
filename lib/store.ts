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
  /** Carteira (walletKey) → perfil, só das carteiras juntadas. */
  links(): Promise<Map<string, string>>;
  /** Põe essas carteiras nesse perfil (tirando de onde estavam). */
  setLinks(keys: string[], profile: string): Promise<void>;
  /** Tira a carteira do perfil; false se ela não estava em nenhum. */
  unlink(key: string): Promise<boolean>;
};

export const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

export function createStore(backend: Backend) {
  // O apelido de um post é o do perfil, se a carteira foi juntada a outras; senão, o da própria carteira
  const authorFor = (l: Loss, links: Map<string, string>) => (l.example ? "example" : links.get(walletKey(l.wallet)) ?? authorOf(l.wallet));
  const load = async () => {
    const [all, links] = await Promise.all([backend.all(), backend.links()]);
    return { all, links, toPublic: (l: Loss): PublicLoss => publicView(l, authorFor(l, links)) };
  };

  async function listLosses(sort: Sort = "new", limit = 50): Promise<PublicLoss[]> {
    const { all: rows, toPublic } = await load();
    const all = [...rows];
    if (sort === "top") all.sort((a, b) => b.amountUsd - a.amountUsd);
    else if (sort === "respects") all.sort((a, b) => b.respects - a.respects);
    else all.sort((a, b) => b.createdAt - a.createdAt);
    return all.slice(0, limit).map(toPublic);
  }

  /** Posts de um apelido (uma carteira ou um perfil de várias), mais recentes primeiro. */
  async function authorLosses(author: string): Promise<PublicLoss[]> {
    const { all, links, toPublic } = await load();
    return all
      .filter((l) => !l.example && authorFor(l, links) === author)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toPublic);
  }

  /**
   * Para a página de um apelido: quantas carteiras o perfil tem, e para onde ir quando o apelido é o antigo
   * de uma carteira que foi juntada a um perfil.
   */
  async function profileInfo(author: string): Promise<{ wallets: number; movedTo: string | null }> {
    const links = await backend.links();
    let wallets = 0;
    let movedTo: string | null = null;
    for (const [key, profile] of links) {
      if (profile === author) wallets++;
      else if (!movedTo && authorOf(key) === author) movedTo = profile;
    }
    return { wallets, movedTo };
  }

  /** Junta as carteiras (e as que já estavam no perfil de alguma delas) num perfil só. Devolve o apelido do perfil. */
  async function linkWallets(wallets: string[]): Promise<string> {
    const links = await backend.links();
    const keys = wallets.map(walletKey);
    const existing = new Set(keys.map((k) => links.get(k)).filter((p): p is string => !!p));
    // Perfil novo tem apelido aleatório: assim, tirar uma carteira depois não a deixa com o mesmo nome do perfil
    const profile = [...existing][0] ?? crypto.randomBytes(4).toString("hex");
    const members = new Set(keys);
    for (const [k, p] of links) if (existing.has(p)) members.add(k);
    await backend.setLinks([...members], profile);
    return profile;
  }

  const unlinkWallet = (wallet: string) => backend.unlink(walletKey(wallet));

  async function getLoss(id: string): Promise<PublicLoss | null> {
    const { all, toPublic } = await load();
    const l = all.find((x) => x.id === id);
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
    if (!(await backend.insert(loss))) return "duplicate";
    return (await load()).toPublic(loss);
  }

  /** Só a carteira que postou, ou outra do mesmo perfil, apaga. A conferência da assinatura fica com quem chama. */
  async function deleteLoss(id: string, wallet: string): Promise<"deleted" | "not_found" | "not_owner"> {
    const { all, links } = await load();
    const l = all.find((x) => x.id === id);
    if (!l || l.example) return "not_found";
    const owner = walletKey(l.wallet) === walletKey(wallet) || (links.has(walletKey(wallet)) && links.get(walletKey(wallet)) === links.get(walletKey(l.wallet)));
    if (!owner) return "not_owner";
    await backend.remove(id);
    return "deleted";
  }

  async function payRespects(id: string, voter: string): Promise<number | null> {
    const key = crypto.createHash("sha256").update(voter).digest("hex").slice(0, 16);
    return backend.respect(id, key);
  }

  /**
   * Ranking pelo maior vacilo de cada apelido (carteiras juntadas somam juntas). O total soma só posts por token (os resumos repetiriam valores).
   * `since` deixa só os posts a partir dessa hora; `chain`, só os dessa rede (num resumo, a do pior token).
   */
  async function leaderboard(limit = 50, filter: { since?: number; chain?: ChainKey } = {}): Promise<LeaderRow[]> {
    const rows = new Map<string, LeaderRow>();
    const { all, links } = await load();
    for (const l of all) {
      if ((filter.since && l.createdAt < filter.since) || (filter.chain && l.chain !== filter.chain)) continue;
      const author = authorFor(l, links);
      // Os exemplos têm todos o mesmo apelido, mas cada carteira de exemplo é uma linha
      const k = l.example ? `example:${walletKey(l.wallet)}` : author;
      const r = rows.get(k) ?? { author, chain: l.chain, family: l.family, total: 0, count: 0, biggest: 0, biggestKind: "missed", biggestToken: "", biggestSymbol: "" };
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
    const { all, toPublic } = await load();
    const best = all
      .filter((l) => !l.example && l.createdAt >= since)
      .reduce<Loss | null>((m, l) => (!m || l.amountUsd > m.amountUsd ? l : m), null);
    return best ? toPublic(best) : null;
  }

  async function stats() {
    const { all, toPublic } = await load();
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

  return { listLosses, authorLosses, profileInfo, linkWallets, unlinkWallet, getLoss, addLoss, deleteLoss, payRespects, leaderboard, fumbleOfWeek, stats };
}

export type Sort = "new" | "top" | "respects";
export type NewLoss = Omit<Loss, "id" | "respects" | "respectedBy" | "createdAt">;
export type LeaderRow = { author: string; chain: string; family: string; total: number; count: number; biggest: number; biggestKind: LossKind; biggestToken: string; biggestSymbol: string; biggestLogo?: string };

const store = createStore(DB_URL ? pgBackend(neonQuery(DB_URL)) : fileBackend());
export const { listLosses, authorLosses, profileInfo, linkWallets, unlinkWallet, getLoss, addLoss, deleteLoss, payRespects, leaderboard, fumbleOfWeek, stats } = store;
