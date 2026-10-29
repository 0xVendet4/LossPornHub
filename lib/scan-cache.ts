import type { NextRequest } from "next/server";
import { privateHash } from "./author";
import { DB_URL } from "./store";
import { neonQuery, type Query } from "./store-pg";
import type { Report } from "./scan/types";

/**
 * Raios-x guardados e limite de raios-x novos por IP. Com banco (Neon na Vercel) vale para todas as instâncias
 * da função; no PC, sem banco, fica em memória. Se o banco falhar, o raio-x segue sem cache e sem limite.
 */
export type ScanStore = {
  get(key: string, maxAgeMs: number): Promise<Report | null>;
  set(key: string, report: Report): Promise<void>;
  /** Conta mais um raio-x novo vindo desse IP (já em hash) na janela atual e devolve quantos já foram. */
  hit(ipHash: string, windowMs: number): Promise<number>;
};

const DAY = 86_400_000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS scans (wallet_key text PRIMARY KEY, scanned_at bigint NOT NULL, report jsonb NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS scan_limits (ip text PRIMARY KEY, window_start bigint NOT NULL, count int NOT NULL)`,
];

export function pgScanStore(query: Query): ScanStore {
  let ready: Promise<void> | null = null;
  const ensure = () => (ready ??= (async () => { for (const s of SCHEMA) await query(s); })());
  // De vez em quando apaga o que já não serve: raios-x e janelas de mais de um dia
  const sweep = () => {
    if (Math.random() > 0.02) return;
    const old = Date.now() - DAY;
    query(`DELETE FROM scans WHERE scanned_at < $1`, [old]).catch(() => {});
    query(`DELETE FROM scan_limits WHERE window_start < $1`, [old]).catch(() => {});
  };

  return {
    async get(key, maxAgeMs) {
      await ensure();
      const rows = await query(`SELECT report FROM scans WHERE wallet_key = $1 AND scanned_at >= $2`, [key, Date.now() - maxAgeMs]);
      return rows.length ? (rows[0].report as Report) : null;
    },
    async set(key, report) {
      await ensure();
      await query(
        `INSERT INTO scans (wallet_key, scanned_at, report) VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (wallet_key) DO UPDATE SET scanned_at = EXCLUDED.scanned_at, report = EXCLUDED.report`,
        [key, report.scannedAt, JSON.stringify(report)]
      );
      sweep();
    },
    async hit(ipHash, windowMs) {
      await ensure();
      const start = Math.floor(Date.now() / windowMs) * windowMs;
      const rows = await query(
        `INSERT INTO scan_limits (ip, window_start, count) VALUES ($1, $2, 1)
         ON CONFLICT (ip) DO UPDATE SET
           count = CASE WHEN scan_limits.window_start = EXCLUDED.window_start THEN scan_limits.count + 1 ELSE 1 END,
           window_start = EXCLUDED.window_start
         RETURNING count`,
        [ipHash, start]
      );
      return Number(rows[0].count);
    },
  };
}

export function memoryScanStore(): ScanStore {
  const scans = new Map<string, Report>();
  const hits = new Map<string, { start: number; count: number }>();
  return {
    async get(key, maxAgeMs) {
      const r = scans.get(key);
      return r && Date.now() - r.scannedAt < maxAgeMs ? r : null;
    },
    async set(key, report) {
      scans.set(key, report);
    },
    async hit(ipHash, windowMs) {
      const start = Math.floor(Date.now() / windowMs) * windowMs;
      const h = hits.get(ipHash);
      const count = h && h.start === start ? h.count + 1 : 1;
      hits.set(ipHash, { start, count });
      return count;
    },
  };
}

export const scanStore = DB_URL ? pgScanStore(neonQuery(DB_URL)) : memoryScanStore();

/** IP de quem chamou. Na Vercel, o primeiro do x-forwarded-for é o do visitante. */
export const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "";

export const hashIp = (ip: string) => privateHash(`ip:${ip}`);
