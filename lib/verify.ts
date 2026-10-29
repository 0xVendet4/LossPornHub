import { verifyMessage, isAddress } from "viem";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { detectFamily, type Family } from "./chains";
import { buildPostMessage } from "./message";

const MAX_AGE_MS = 10 * 60 * 1000;

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
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_AGE_MS)
    return { ok: false, error: "The signature expired. Sign again." };

  return { ok: true, req: { wallet, family, target, caption, timestamp, signature } };
}

export async function verifyPostSignature(r: PostRequest): Promise<boolean> {
  const message = buildPostMessage(r);
  try {
    if (r.family === "evm") {
      if (!isAddress(r.wallet)) return false;
      return await verifyMessage({ address: r.wallet, message, signature: r.signature as `0x${string}` });
    }
    const pubkey = bs58.decode(r.wallet);
    const sig = bs58.decode(r.signature);
    if (pubkey.length !== 32 || sig.length !== 64) return false;
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pubkey);
  } catch {
    return false;
  }
}
