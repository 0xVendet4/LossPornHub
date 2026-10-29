"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useSignMessage } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { walletKey, type Family } from "@/lib/chains";
import { short } from "@/lib/format";
import { buildLinkMessage, buildUnlinkMessage } from "@/lib/message";
import { authorName } from "@/lib/privacy";
import { IconArrow, IconCheck, IconLink, IconX } from "./Icons";
import { Badge, EvmButton, SolButton } from "./WalletButtons";

type Signed = { wallet: string; family: Family; signature: string };

const newCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
// Cancelar a assinatura na carteira não é erro
const cancelled = (err: any) => /reject|denied|cancel/i.test(err?.message ?? "");

/**
 * Juntar carteiras num perfil anônimo. Cada carteira assina a mesma mensagem com um código aleatório;
 * para a segunda EVM, a pessoa troca de conta na extensão e o endereço aqui muda sozinho.
 */
export default function LinkWallets() {
  const evm = useAccount();
  const sol = useWallet();
  const { signMessageAsync } = useSignMessage();
  const [code, setCode] = useState("");
  const [timestamp, setTimestamp] = useState(0);
  const [signed, setSigned] = useState<Signed[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState("");
  const [removed, setRemoved] = useState<string[]>([]);
  const [removeError, setRemoveError] = useState("");
  useEffect(() => setCode(newCode()), []);

  const connected: { wallet: string; family: Family }[] = [
    ...(evm.address ? [{ wallet: evm.address, family: "evm" as const }] : []),
    ...(sol.publicKey ? [{ wallet: sol.publicKey.toBase58(), family: "solana" as const }] : []),
  ];
  const isSigned = (w: string) => signed.some((s) => walletKey(s.wallet) === walletKey(w));

  async function sign(family: Family, message: string) {
    if (family === "evm") return signMessageAsync({ message });
    if (!sol.signMessage) throw new Error("This Solana wallet can't sign messages. Try Phantom or Solflare.");
    return bs58.encode(await sol.signMessage(new TextEncoder().encode(message)));
  }

  async function add(wallet: string, family: Family) {
    setError("");
    setBusy(wallet);
    try {
      // Todas assinam com a mesma hora: o servidor monta a mesma mensagem para cada uma
      const at = timestamp || Date.now();
      const signature = await sign(family, buildLinkMessage({ wallet, code, timestamp: at }));
      setTimestamp(at);
      setSigned((s) => [...s, { wallet, family, signature }]);
    } catch (err: any) {
      if (!cancelled(err)) setError(err?.message || "Couldn't sign. Try again.");
    }
    setBusy(null);
  }

  async function link() {
    setError("");
    setBusy("link");
    try {
      const res = await fetch("/api/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, timestamp, entries: signed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't link the wallets. Try again.");
      setProfile(data.profile);
    } catch (err: any) {
      setError(err?.message || "Couldn't link the wallets. Try again.");
    }
    setBusy(null);
  }

  async function remove(wallet: string, family: Family) {
    setRemoveError("");
    setBusy(`rm:${wallet}`);
    try {
      const body = { wallet, timestamp: Date.now() };
      const signature = await sign(family, buildUnlinkMessage(body));
      const res = await fetch("/api/link", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, signature }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't remove the wallet. Try again.");
      setRemoved((r) => [...r, walletKey(wallet)]);
    } catch (err: any) {
      if (!cancelled(err)) setRemoveError(err?.message || "Couldn't remove the wallet. Try again.");
    }
    setBusy(null);
  }

  function restart() {
    setCode(newCode());
    setTimestamp(0);
    setSigned([]);
    setProfile("");
    setError("");
  }

  const errorBox = (text: string) =>
    text && (
      <p role="alert" className="rounded-2xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
        {text}
      </p>
    );

  if (profile)
    return (
      <div className="surface-glow flex flex-col items-start gap-4 p-6 sm:p-8">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-gain/15 text-gain">
          <IconCheck className="size-5" />
        </span>
        <p className="font-display text-2xl font-semibold">Linked.</p>
        <p className="max-w-[52ch] text-dim">
          Posts from these {signed.length} wallets now show as <span className="font-mono text-fg">{authorName(profile)}</span>, with their totals added
          up in the Hall of Shame. The addresses stay private.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/w/${profile}`} className="btn btn-primary h-11 px-5 text-sm">
            See the profile
            <IconArrow />
          </Link>
          <button type="button" onClick={restart} className="btn btn-ghost h-11 px-5 text-sm">
            Link more wallets
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-8">
      <section className="surface flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-xl font-semibold">Sign with each wallet</h2>
          <p className="text-sm leading-relaxed text-dim">
            Connect a wallet and sign. For a second EVM wallet, switch the account in your wallet app: the address below changes and you sign
            again. A signature is a text message, not a transaction. No gas.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {(["evm", "solana"] as const).map((family) => {
            const c = connected.find((x) => x.family === family);
            return (
              <div key={family} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
                <span className="flex items-center gap-2.5 text-sm">
                  <Badge kind={family === "evm" ? "evm" : "sol"} />
                  {c ? <span className="font-mono">{short(c.wallet)}</span> : <span className="text-dim">{family === "evm" ? "EVM wallet" : "Solana wallet"}</span>}
                </span>
                {!c ? (
                  family === "evm" ? <EvmButton /> : <SolButton />
                ) : isSigned(c.wallet) ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-gain">
                    <IconCheck className="size-3.5" />
                    Signed
                  </span>
                ) : (
                  <button type="button" onClick={() => add(c.wallet, family)} disabled={!!busy || signed.length >= 10} className="btn btn-ghost h-10 px-4 text-sm disabled:opacity-50">
                    {busy === c.wallet ? "Waiting for signature…" : "Sign with this wallet"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {signed.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="label">Signed so far, visible only to you</span>
            <ul className="flex flex-wrap gap-2">
              {signed.map((s) => (
                <li key={s.wallet} className="pill gap-2 py-1 font-mono text-xs">
                  <Badge kind={s.family === "evm" ? "evm" : "sol"} />
                  {short(s.wallet)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {errorBox(error)}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={link} disabled={signed.length < 2 || !!busy} className="btn btn-primary h-11 gap-2 px-5 text-sm disabled:opacity-50">
            <IconLink className="size-4" />
            {busy === "link" ? "Linking…" : signed.length < 2 ? "Sign with two wallets to link" : `Link ${signed.length} wallets`}
          </button>
          {signed.length > 0 && (
            <button type="button" onClick={restart} className="btn btn-ghost h-11 px-5 text-sm">
              Start over
            </button>
          )}
        </div>
      </section>

      <details className="surface group p-6 sm:p-8">
        <summary className="cursor-pointer list-none font-display text-lg font-semibold">
          Remove a wallet from its profile
          <span className="ml-2 text-sm font-normal text-dim group-open:hidden">Show</span>
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-dim">
            Sign with the wallet you want out. Its posts go back to its own anonymous name; the other wallets stay together.
          </p>
          {connected.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-dim">
              <span>Connect the wallet to remove:</span>
              <EvmButton />
              <SolButton />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {connected.map((c) => (
                <div key={c.wallet} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
                  <span className="flex items-center gap-2.5 font-mono text-sm">
                    <Badge kind={c.family === "evm" ? "evm" : "sol"} />
                    {short(c.wallet)}
                  </span>
                  {removed.includes(walletKey(c.wallet)) ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-dim">
                      <IconCheck className="size-3.5" />
                      Removed
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => remove(c.wallet, c.family)}
                      disabled={!!busy}
                      className="btn h-10 gap-1.5 border border-loss/40 bg-loss/15 px-4 text-sm text-loss hover:bg-loss/25 disabled:opacity-50"
                    >
                      <IconX className="size-3.5" />
                      {busy === `rm:${c.wallet}` ? "Waiting for signature…" : "Sign and remove"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {errorBox(removeError)}
        </div>
      </details>
    </div>
  );
}
