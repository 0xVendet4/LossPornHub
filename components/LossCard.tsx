"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CHAINS } from "@/lib/chains";
import { ago, amount, date, money, multiple, painUsd, usd } from "@/lib/format";
import { authorName } from "@/lib/privacy";
import { tierOf } from "@/lib/tier";
import type { PublicLoss } from "@/lib/types";
import CandleChart from "./CandleChart";
import MoveChart from "./MoveChart";
import TokenAvatar from "./TokenAvatar";
import { IconCheck, IconDownload, IconFlame, IconTrendDown, IconTrendUp, IconWallet, IconWide, IconX } from "./Icons";

const KIND = {
  missed: { label: "Left on the table", icon: IconTrendUp },
  realized: { label: "Realized loss", icon: IconTrendDown },
  wallet: { label: "Whole wallet", icon: IconWallet },
  total: { label: "Total loss porn", icon: IconFlame },
} as const;

/** Medidor de dor: o preenchimento carrega a gravidade, o trilho é a mesma cor bem mais fraca. */
export function PainMeter({ amountUsd }: { amountUsd: number }) {
  const { level, name } = tierOf(amountUsd);
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-[3px]" role="img" aria-label={`Pain level ${level} of 5: ${name}`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= level ? "bg-loss" : "bg-loss/15"}`} />
        ))}
      </div>
      <span className="shrink-0 text-[13px]">
        <span className="font-medium">{name}</span> <span className="text-dim">· level {level} of 5</span>
      </span>
    </div>
  );
}

const numberSize = (s: string) => (s.length <= 8 ? "text-[2.75rem]" : s.length <= 10 ? "text-[2.4rem]" : "text-[2rem]");

export default function LossCard({ loss, preview = false, delay = 0 }: { loss: PublicLoss; preview?: boolean; delay?: number }) {
  const chain = CHAINS[loss.chain];
  const { level } = tierOf(loss.amountUsd);
  const kind = KIND[loss.kind];
  const Icon = kind.icon;
  const [respects, setRespects] = useState(loss.respects);
  const [paid, setPaid] = useState(false);
  const [justPaid, setJustPaid] = useState(false);
  const verified = loss.target !== "legacy";

  useEffect(() => {
    try {
      setPaid(localStorage.getItem(`f:${loss.id}`) === "1");
    } catch {}
  }, [loss.id]);

  async function payRespects() {
    if (paid || preview) return;
    setPaid(true);
    setJustPaid(true);
    setRespects((r) => r + 1);
    try {
      localStorage.setItem(`f:${loss.id}`, "1");
    } catch {}
    const res = await fetch(`/api/losses/${loss.id}/respect`, { method: "POST" });
    if (res.ok) setRespects((await res.json()).respects);
  }

  /** Abre o X com o texto do post e o link da página dele */
  function share() {
    const sym = `$${loss.token.toUpperCase()}`;
    const text =
      loss.kind === "realized"
        ? `Lost ${money(loss.amountUsd)} on ${sym} buying high and selling low.`
        : loss.kind === "total"
          ? `${money(loss.amountUsd)} of total loss porn across ${loss.tokensCount} tokens.`
          : loss.kind === "wallet"
            ? `Left ${money(loss.amountUsd)} on the table selling ${loss.tokensCount} tokens too early.`
            : `Left ${money(loss.amountUsd)} on the table selling ${sym} too early. It went up ${loss.multiple ? multiple(loss.multiple) : "a lot"} after.`;
    const url = `${window.location.origin}/p/${loss.id}`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text + " On-chain wallet scan:")}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
  }

  const qty = loss.soldAmount ?? 0;
  const move =
    loss.kind === "missed" && qty > 0 && loss.soldUsd !== undefined && loss.valueNowUsd !== undefined
      ? { from: loss.soldUsd / qty, to: loss.valueNowUsd / qty, fromLabel: "You sold here", toLabel: "Today", mult: loss.multiple }
      : loss.kind === "realized" && qty > 0 && loss.soldUsd !== undefined && loss.boughtUsd !== undefined
        ? { from: loss.boughtUsd / qty, to: loss.soldUsd / qty, fromLabel: "Bought at", toLabel: "Sold at" }
        : null;

  const summary = loss.kind === "wallet" || loss.kind === "total";
  const title = summary ? `${loss.tokensCount ?? "Several"} tokens` : `$${loss.token.toUpperCase()}`;
  const network = summary ? (loss.family === "solana" ? "Solana" : "EVM") : chain.name;
  const demo = !!loss.example || loss.author === "example";

  return (
    <article
      className={`${level >= 5 ? "surface-glow" : "surface"} card-hover flex flex-col ${preview ? "" : "rise"}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="flex flex-col gap-5 p-5">
        <header className="flex items-center gap-3">
          <TokenAvatar symbol={loss.token} logo={loss.logo} size={42} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-display text-[17px] font-semibold leading-tight">{title}</span>
            <span className="flex items-center gap-1.5 text-[13px] text-dim">
              <span className="size-2 shrink-0 rounded-full" style={{ background: chain.color }} />
              {network}
              <span aria-hidden>·</span>
              {preview || demo ? (
                authorName(loss.author)
              ) : (
                <Link href={`/w/${loss.author}`} className="font-mono text-xs hover:text-fg" title="See every post from this person">
                  {authorName(loss.author)}
                </Link>
              )}
            </span>
          </div>
          <span className="shrink-0 text-xs text-dim" suppressHydrationWarning>
            {preview ? "Preview" : ago(loss.createdAt)}
          </span>
        </header>

        <div className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-loss">
            <Icon />
            {kind.label}
          </span>
          <p className={`whitespace-nowrap font-sans font-semibold leading-none tracking-[-0.03em] ${numberSize(painUsd(loss.kind, loss.amountUsd))}`}>
            {painUsd(loss.kind, loss.amountUsd)}
          </p>
          {loss.kind === "missed" && loss.multiple ? (
            <p className="text-sm text-dim">
              Went up <span className="font-medium text-fg">{multiple(loss.multiple)}</span> after you sold
            </p>
          ) : loss.kind === "total" ? (
            <p className="text-sm text-dim">
              Across {loss.tokensCount} tokens. The worst was <span className="font-medium text-fg">${loss.token.toUpperCase()}</span>.
            </p>
          ) : loss.kind === "wallet" ? (
            <p className="text-sm text-dim">
              Across {loss.tokensCount} tokens sold too early. The worst was <span className="font-medium text-fg">${loss.token.toUpperCase()}</span>.
            </p>
          ) : null}
        </div>

        {loss.kind === "total" && (
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line text-[13px]">
            {[
              ["Left on the table", money(loss.missedUsd ?? 0)],
              ["Realized loss", usd(loss.realizedLossUsd ?? 0)],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1 bg-raise p-4">
                <dt className="text-dim">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums text-loss">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {move && (
          <div className="flex flex-col gap-3 rounded-2xl bg-raise/70 p-4 [--chart-surface:#1f1d27]">
            {loss.kind === "missed" && loss.tokenAddress && loss.lastSellAt ? (
              <CandleChart {...move} id={loss.id} soldUsd={loss.soldUsd} source={{ chain: loss.chain, token: loss.tokenAddress, pool: loss.pool, since: loss.lastSellAt, demo }} />
            ) : (
              <MoveChart {...move} id={loss.id} />
            )}
            <p className="border-t border-line pt-3 text-[13px] leading-relaxed text-dim">
              {loss.kind === "missed" ? (
                <>
                  Sold {amount(qty)} for <span className="font-medium text-fg">{money(loss.soldUsd!)}</span>. Worth{" "}
                  <span className="font-medium text-fg">{money(loss.valueNowUsd!)}</span> today.
                </>
              ) : (
                <>
                  Paid <span className="font-medium text-fg">{money(loss.boughtUsd!)}</span> and got back{" "}
                  <span className="font-medium text-fg">{money(loss.soldUsd!)}</span>.
                </>
              )}
            </p>
          </div>
        )}

        {loss.caption && (
          <blockquote className="flex gap-2.5 rounded-2xl border border-line px-4 py-3 text-[15px] leading-snug">
            <span className="-mt-0.5 font-display text-2xl leading-none text-lilac" aria-hidden>
              “
            </span>
            <p className="min-w-0 whitespace-pre-wrap break-words">{loss.caption}</p>
          </blockquote>
        )}

        <PainMeter amountUsd={loss.amountUsd} />
      </div>

      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5 text-xs">
        <button
          type="button"
          onClick={payRespects}
          disabled={paid || preview}
          aria-label={paid ? "You already paid respects" : "Pay respects"}
          className={`btn h-8 gap-2 border px-3 text-[13px] disabled:cursor-default disabled:opacity-100 ${justPaid ? "pop" : ""} ${
            paid ? "border-lilac/40 bg-lilac/15 text-lilac" : "border-line bg-raise text-fg hover:border-lilac/50"
          }`}
        >
          <span className="font-display font-bold">F</span>
          <span className="tabular-nums text-dim">{respects}</span>
        </button>
        {loss.example ? (
          <span className="pill">Example</span>
        ) : verified ? (
          <span className="pill text-gain" title="Values computed from the wallet's swaps">
            <IconCheck className="size-3" />
            On-chain
          </span>
        ) : null}
        {loss.lastSellAt && <span className="text-dim">Sold on {date(loss.lastSellAt)}</span>}
        <span className="ml-auto flex items-center gap-1">
          {!preview && (
            <a
              href={`/api/card?id=${loss.id}`}
              download
              aria-label="Download card as image"
              title="Download card as image"
              className="inline-flex size-8 items-center justify-center rounded-full text-dim transition-colors hover:bg-raise hover:text-fg"
            >
              <IconDownload className="size-4" />
            </a>
          )}
          {!preview && (
            <a
              href={`/api/card?id=${loss.id}&layout=wide`}
              download
              aria-label="Download wide card as image"
              title="Download wide card (for X)"
              className="inline-flex size-8 items-center justify-center rounded-full text-dim transition-colors hover:bg-raise hover:text-fg"
            >
              <IconWide className="size-4" />
            </a>
          )}
          {!preview && (
            <button
              type="button"
              onClick={share}
              aria-label="Share on X"
              title="Share on X"
              className="inline-flex size-8 items-center justify-center rounded-full text-dim transition-colors hover:bg-raise hover:text-fg"
            >
              <IconX />
            </button>
          )}
        </span>
      </footer>
    </article>
  );
}
