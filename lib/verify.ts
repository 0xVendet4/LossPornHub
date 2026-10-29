import { verifyMessage, isAddress } from "viem";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { detectFamily, type Family } from "./chains";
import { buildDeleteMessage, buildPostMessage } from "./message";

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

export const verifyPostSignature = (r: PostRequest) => verifySignature(r.family, r.wallet, buildPostMessage(r), r.signature);

export type DeleteRequest = { wallet: string; family: Family; id: string; timestamp: number; signature: string };

export function parseDelete(id: string, body: any): { ok: true; req: DeleteRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || typeof body.wallet !== "string" || typeof body.signature !== "string") return { ok: false, error: "Invalid request." };
  const family = detectFamily(body.wallet);
  if (!family) return { ok: false, error: "Invalid wallet address." };
  const timestamp = Number(body.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_AGE_MS) return { ok: false, error: "The signature expired. Sign again." };
  return { ok: true, req: { wallet: body.wallet, family, id, timestamp, signature: body.signature } };
}

export const verifyDeleteSignature = (r: DeleteRequest) => verifySignature(r.family, r.wallet, buildDeleteMessage(r), r.signature);

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
