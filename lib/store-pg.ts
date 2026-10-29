import { neon } from "@neondatabase/serverless";
import { walletKey } from "./chains";
import type { Loss } from "./types";
import type { Backend } from "./store";

/**
 * Backend Postgres (Neon, grátis na Vercel). Cada post é uma linha com o JSON do post;
 * os F ficam numa tabela própria, um por (post, votante), para a contagem não depender de ler-modificar-gravar.
 */
export type Query = (text: string, params?: unknown[]) => Promise<Record<string, any>[]>;

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS losses (
    id text PRIMARY KEY,
    wallet_key text NOT NULL,
    target text NOT NULL,
    created_at bigint NOT NULL,
    amount_usd double precision NOT NULL,
    data jsonb NOT NULL,
    UNIQUE (wallet_key, target)
  )`,
  `CREATE TABLE IF NOT EXISTS respects (
    loss_id text NOT NULL REFERENCES losses(id) ON DELETE CASCADE,
    voter text NOT NULL,
    PRIMARY KEY (loss_id, voter)
  )`,
  // Carteiras juntadas num perfil anônimo: os posts de todas aparecem com o apelido do perfil
  `CREATE TABLE IF NOT EXISTS wallet_links (
    wallet_key text PRIMARY KEY,
    profile text NOT NULL,
    linked_at bigint NOT NULL
  )`,
];

const CACHE_MS = 3_000;

export function neonQuery(url: string): Query {
  const sql = neon(url);
  return (text, params = []) => sql.query(text, params as any[]) as Promise<Record<string, any>[]>;
}

export function pgBackend(query: Query): Backend {
  let ready: Promise<void> | null = null;
  const ensure = () => (ready ??= (async () => { for (const s of SCHEMA) await query(s); })());

  // Uma página renderiza fita, feed e stats: cache curtíssimo para não ler a tabela três vezes
  let cached: { rows: Loss[]; at: number } | null = null;
  let cachedLinks: { map: Map<string, string>; at: number } | null = null;

  const all = async (): Promise<Loss[]> => {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.rows;
    await ensure();
    const rows = await query(
      `SELECT l.data, (SELECT count(*) FROM respects r WHERE r.loss_id = l.id)::int AS respects
       FROM losses l ORDER BY l.created_at DESC`
    );
    const losses = rows.map((r) => ({ ...(r.data as Omit<Loss, "respects" | "respectedBy">), respects: Number(r.respects), respectedBy: [] }));
    cached = { rows: losses, at: Date.now() };
    return losses;
  };

  const links = async (): Promise<Map<string, string>> => {
    if (cachedLinks && Date.now() - cachedLinks.at < CACHE_MS) return cachedLinks.map;
    await ensure();
    const rows = await query(`SELECT wallet_key, profile FROM wallet_links`);
    const map = new Map(rows.map((r) => [r.wallet_key as string, r.profile as string]));
    cachedLinks = { map, at: Date.now() };
    return map;
  };

  return {
    all,
    links,
    async setLinks(keys, profile) {
      await ensure();
      // Uma linha por carteira: ($3, $1, $2), ($4, $1, $2)…
      const rows = keys.map((_, i) => `($${i + 3}, $1, $2)`).join(", ");
      await query(
        `INSERT INTO wallet_links (wallet_key, profile, linked_at) VALUES ${rows}
         ON CONFLICT (wallet_key) DO UPDATE SET profile = EXCLUDED.profile, linked_at = EXCLUDED.linked_at`,
        [profile, Date.now(), ...keys]
      );
      cachedLinks = null;
    },
    async unlink(key) {
      await ensure();
      const rows = await query(`DELETE FROM wallet_links WHERE wallet_key = $1 RETURNING wallet_key`, [key]);
      cachedLinks = null;
      return rows.length > 0;
    },
    async insert(loss) {
      await ensure();
      const { respects: _r, respectedBy: _rb, ...data } = loss;
      const rows = await query(
        `INSERT INTO losses (id, wallet_key, target, created_at, amount_usd, data)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (wallet_key, target) DO NOTHING RETURNING id`,
        [loss.id, walletKey(loss.wallet), loss.target, loss.createdAt, loss.amountUsd, JSON.stringify(data)]
      );
      cached = null;
      return rows.length > 0;
    },
    async respect(id, voter) {
      await ensure();
      await query(
        `INSERT INTO respects (loss_id, voter) SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM losses WHERE id = $1)
         ON CONFLICT DO NOTHING`,
        [id, voter]
      );
      const rows = await query(`SELECT (SELECT count(*) FROM respects WHERE loss_id = $1)::int AS n FROM losses WHERE id = $1`, [id]);
      cached = null;
      return rows.length ? Number(rows[0].n) : null;
    },
    async remove(id) {
      await ensure();
      await query(`DELETE FROM losses WHERE id = $1`, [id]);
      cached = null;
    },
  };
}
