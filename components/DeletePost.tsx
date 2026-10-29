"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignMessage } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import type { Family } from "@/lib/chains";
import { buildDeleteMessage } from "@/lib/message";
import { IconTrash } from "./Icons";
import { EvmButton, SolButton } from "./WalletButtons";

/**
 * Apagar o próprio post. A página não sabe qual carteira postou (é privado), então qualquer um vê o botão,
 * mas o servidor só aceita a assinatura da carteira dona do post.
 */
export default function DeletePost({ id, family }: { id: string; family: Family }) {
  const router = useRouter();
  const evm = useAccount();
  const sol = useWallet();
  const { signMessageAsync } = useSignMessage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wallet = family === "evm" ? evm.address : sol.publicKey?.toBase58();

  async function remove() {
    if (!wallet) return;
    setError("");
    setBusy(true);
    try {
      const body = { wallet, id, timestamp: Date.now() };
      const message = buildDeleteMessage(body);
      const signature =
        family === "evm" ? await signMessageAsync({ message }) : bs58.encode(await sol.signMessage!(new TextEncoder().encode(message)));
      const res = await fetch(`/api/losses/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, signature }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't delete. Try again.");
      router.push("/");
      router.refresh();
    } catch (err: any) {
      // Cancelar a assinatura na carteira não é erro
      if (!/reject|denied|cancel/i.test(err?.message ?? "")) setError(err?.message || "Couldn't delete. Try again.");
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mx-auto inline-flex items-center gap-1.5 text-sm text-dim hover:text-loss">
        <IconTrash className="size-3.5" />
        Is this yours? Delete it
      </button>
    );

  return (
    <div className="surface flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg font-semibold">Delete this post?</p>
        <p className="text-sm text-dim">
          Only the {family === "evm" ? "EVM" : "Solana"} wallet that posted it can delete it. You sign a message, it costs no gas, and the post and its Fs are gone for
          good.
        </p>
      </div>
      {!wallet && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-dim">
          <span>Connect the wallet that posted it:</span>
          {family === "evm" ? <EvmButton /> : <SolButton />}
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-2xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={remove}
          disabled={!wallet || busy}
          className="btn h-11 gap-2 border border-loss/40 bg-loss/15 px-5 text-sm text-loss hover:bg-loss/25 disabled:opacity-50"
        >
          <IconTrash className="size-4" />
          {busy ? "Waiting for signature…" : "Sign and delete"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost h-11 px-5 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
