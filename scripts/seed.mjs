// Cria posts de exemplo (marcados como "Example") para ver o feed cheio.
// Os valores são fictícios. Uso: npm run seed            (não sobrescreve dados existentes)
//                                 npm run seed -- --force (apaga e recria)
// Com DATABASE_URL definida (banco da Vercel/Neon), grava no Postgres em vez de data/losses.json.
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import nacl from "tweetnacl";
import bs58 from "bs58";

const FILE = path.join(process.cwd(), "data", "losses.json");
const DAY = 86_400_000;

// kind, chain, token, endereço do token, valor, detalhes, legenda, F
const SAMPLES = [
  ["missed", "solana", "WIF", "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", 1_196_000,
    { soldAmount: 1_400_000, soldUsd: 3_400, valueNowUsd: 1_199_400, multiple: 352 }, "Sold it to pay rent. Rent says thanks.", 312],
  ["realized", "ethereum", "PEPE", "0x6982508145454ce325ddbe47a25d4ec3d2311933", 81_200,
    { soldAmount: 9e9, soldUsd: 14_800, boughtUsd: 96_000 }, "Bought the top, sold the bottom. Flawless execution.", 204],
  ["wallet", "solana", "BONK", null, 433_900, { tokensCount: 7 }, "Professional paper hands.", 97],
  ["missed", "base", "BRETT", "0x532f27101965dd16442e59d40670faf5ebb142e4", 133_700,
    { soldAmount: 2_000_000, soldUsd: 1_300, valueNowUsd: 135_000, multiple: 104 }, "Took profit at 2x thinking I was a genius.", 61],
  ["realized", "solana", "JUP", "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", 31_000,
    { soldAmount: 40_000, soldUsd: 21_000, boughtUsd: 52_000 }, "Turned an airdrop into debt.", 33],
  ["missed", "arbitrum", "GMX", "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a", 18_250,
    { soldAmount: 900, soldUsd: 9_000, valueNowUsd: 27_250, multiple: 3 }, "", 12],
  ["realized", "bsc", "CAKE", "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", 950,
    { soldAmount: 400, soldUsd: 1_050, boughtUsd: 2_000 }, "First time using leverage. Also the last.", 4],
];

// Mesma mensagem de lib/message.ts
const message = (p) =>
  ["LossPornHub: I want to post my wallet scan.", "", `Wallet: ${p.wallet}`, `Post: ${p.target}`, `Caption: ${p.caption}`, `Timestamp: ${p.timestamp}`].join("\n");

const force = process.argv.includes("--force");
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
let sql = null;
if (DB_URL) {
  const { neon } = await import("@neondatabase/serverless");
  sql = neon(DB_URL);
  await sql.query(`CREATE TABLE IF NOT EXISTS losses (id text PRIMARY KEY, wallet_key text NOT NULL, target text NOT NULL, created_at bigint NOT NULL, amount_usd double precision NOT NULL, data jsonb NOT NULL, UNIQUE (wallet_key, target))`);
  await sql.query(`CREATE TABLE IF NOT EXISTS respects (loss_id text NOT NULL REFERENCES losses(id) ON DELETE CASCADE, voter text NOT NULL, PRIMARY KEY (loss_id, voter))`);
  const [{ n }] = await sql.query("SELECT count(*)::int AS n FROM losses");
  if (n > 0 && !force) {
    console.log(`O banco já tem ${n} posts. Use "npm run seed -- --force" para apagar e recriar.`);
    process.exit(0);
  }
  if (force) await sql.query("DELETE FROM losses");
} else {
  const existing = await fs.readFile(FILE, "utf8").then(JSON.parse).catch(() => []);
  if (existing.length && !force) {
    console.log(`data/losses.json já tem ${existing.length} posts. Use "npm run seed -- --force" para recriar.`);
    process.exit(0);
  }
}

const now = Date.now();
const losses = [];
for (const [i, [kind, chain, token, tokenAddress, amountUsd, extra, caption, respects]] of SAMPLES.entries()) {
  const createdAt = now - (i * 47 + 5) * 60_000;
  const family = chain === "solana" ? "solana" : "evm";
  let wallet, sign;
  if (family === "solana") {
    const kp = nacl.sign.keyPair();
    wallet = bs58.encode(kp.publicKey);
    sign = async (m) => bs58.encode(nacl.sign.detached(new TextEncoder().encode(m), kp.secretKey));
  } else {
    const acc = privateKeyToAccount(generatePrivateKey());
    wallet = acc.address;
    sign = (m) => acc.signMessage({ message: m });
  }
  const target = kind === "wallet" ? "wallet" : `${kind}:${chain}:${tokenAddress}`;
  const signature = await sign(message({ wallet, target, caption, timestamp: createdAt }));
  losses.push({
    id: crypto.randomBytes(6).toString("base64url"),
    kind,
    family,
    chain,
    wallet,
    target,
    token,
    ...(tokenAddress ? { tokenAddress } : {}),
    amountUsd,
    ...extra,
    lastSellAt: now - (30 + i * 41) * DAY,
    caption,
    signature,
    respects,
    respectedBy: [],
    createdAt,
    example: true,
  });
}

if (sql) {
  for (const l of losses) {
    const { respects, respectedBy, ...data } = l;
    const walletKey = l.wallet.startsWith("0x") ? l.wallet.toLowerCase() : l.wallet;
    await sql.query(
      "INSERT INTO losses (id, wallet_key, target, created_at, amount_usd, data) VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT DO NOTHING",
      [l.id, walletKey, l.target, l.createdAt, l.amountUsd, JSON.stringify(data)]
    );
    // F de exemplo: votantes fictícios, um por F
    for (let i = 0; i < respects; i++) await sql.query("INSERT INTO respects (loss_id, voter) VALUES ($1, $2) ON CONFLICT DO NOTHING", [l.id, `seed-${i}`]);
  }
  console.log(`${losses.length} posts de exemplo criados no banco`);
} else {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(losses, null, 2));
  console.log(`${losses.length} posts de exemplo criados em data/losses.json`);
}
