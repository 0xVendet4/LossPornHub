import { verifyMessage, isAddress } from "viem";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { detectFamily, walletKey, type Family } from "./chains";
import { buildDeleteMessage, buildLinkMessage, buildPostMessage, buildUnlinkMessage } from "./message";

const MAX_AGE_MS = 10 * 60 * 1000;
const fresh = (timestamp: number) => Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp) <= MAX_AGE_MS;

export type PostRequest = { wallet: string; family: Family; target: string; caption: string; timestamp: number; signature: string };

export function parsePost(body: any): { ok: true; req: PostRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request." };
  const { wallet, target, caption = "", signature } = body;
  const timestamp = Number(body.timestamp);

  if (typeof wallet !== "string" || typeof target !== "string" || typeof caption !== "string" || typeof signature !== "string")
    return { ok: false, error: "Invalid request." };
  const family = detectFamily(wallet);
  if (!family) return { ok: false, error: "Invalid wallet address." };
  if (!/^(total|wallet|(missed|realized):[a-z]+:[A-Za-z0-9]{20,64})$/.test(target)) return { ok: false, error: "Invalid post." };
  if (caption.length > 280 || caption !== caption.trim()) return { ok: false, error: "Invalid caption (up to 280 characters)." };
  if (!fresh(timestamp)) return { ok: false, error: "The signature expired. Sign again." };

  return { ok: true, req: { wallet, family, target, caption, timestamp, signature } };
}

export const verifyPostSignature = (r: PostRequest) => verifySignature(r.family, r.wallet, buildPostMessage(r), r.signature);

export type DeleteRequest = { wallet: string; family: Family; id: string; timestamp: number; signature: string };

export function parseDelete(id: string, body: any): { ok: true; req: DeleteRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || typeof body.wallet !== "string" || typeof body.signature !== "string") return { ok: false, error: "Invalid request." };
  const family = detectFamily(body.wallet);
  if (!family) return { ok: false, error: "Invalid wallet address." };
  const timestamp = Number(body.timestamp);
  if (!fresh(timestamp)) return { ok: false, error: "The signature expired. Sign again." };
  return { ok: true, req: { wallet: body.wallet, family, id, timestamp, signature: body.signature } };
}

export const verifyDeleteSignature = (r: DeleteRequest) => verifySignature(r.family, r.wallet, buildDeleteMessage(r), r.signature);

export const LINK_CODE = /^[0-9a-f]{16}$/;
export const MAX_LINKED = 10;

export type LinkEntry = { wallet: string; family: Family; signature: string };
export type LinkRequest = { code: string; timestamp: number; entries: LinkEntry[] };

export function parseLink(body: any): { ok: true; req: LinkRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || typeof body.code !== "string" || !LINK_CODE.test(body.code) || !Array.isArray(body.entries))
    return { ok: false, error: "Invalid request." };
  const timestamp = Number(body.timestamp);
  if (!fresh(timestamp)) return { ok: false, error: "The signatures expired. Start over and sign again." };
  const entries: LinkEntry[] = [];
  for (const e of body.entries) {
    if (!e || typeof e.wallet !== "string" || typeof e.signature !== "string") return { ok: false, error: "Invalid request." };
    const family = detectFamily(e.wallet);
    if (!family) return { ok: false, error: "Invalid wallet address." };
    entries.push({ wallet: e.wallet, family, signature: e.signature });
  }
  if (new Set(entries.map((e) => walletKey(e.wallet))).size !== entries.length) return { ok: false, error: "The same wallet was signed twice." };
  if (entries.length < 2) return { ok: false, error: "Sign with at least two wallets." };
  if (entries.length > MAX_LINKED) return { ok: false, error: `Up to ${MAX_LINKED} wallets at a time.` };
  return { ok: true, req: { code: body.code, timestamp, entries } };
}

/** A carteira que não confere, ou null se todas assinaram a mensagem com o código. */
export async function badLinkSignature(r: LinkRequest): Promise<string | null> {
  for (const e of r.entries)
    if (!(await verifySignature(e.family, e.wallet, buildLinkMessage({ wallet: e.wallet, code: r.code, timestamp: r.timestamp }), e.signature))) return e.wallet;
  return null;
}

export type UnlinkRequest = { wallet: string; family: Family; timestamp: number; signature: string };

export function parseUnlink(body: any): { ok: true; req: UnlinkRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || typeof body.wallet !== "string" || typeof body.signature !== "string") return { ok: false, error: "Invalid request." };
  const family = detectFamily(body.wallet);
  if (!family) return { ok: false, error: "Invalid wallet address." };
  const timestamp = Number(body.timestamp);
  if (!fresh(timestamp)) return { ok: false, error: "The signature expired. Sign again." };
  return { ok: true, req: { wallet: body.wallet, family, timestamp, signature: body.signature } };
}

export const verifyUnlinkSignature = (r: UnlinkRequest) => verifySignature(r.family, r.wallet, buildUnlinkMessage(r), r.signature);

async function verifySignature(family: Family, wallet: string, message: string, signature: string): Promise<boolean> {
  try {
    if (family === "evm") {
      if (!isAddress(wallet)) return false;
      return await verifyMessage({ address: wallet, message, signature: signature as `0x${string}` });
    }
    const pubkey = bs58.decode(wallet);
    const sig = bs58.decode(signature);
    if (pubkey.length !== 32 || sig.length !== 64) return false;
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pubkey);
  } catch {
    return false;
  }
}
