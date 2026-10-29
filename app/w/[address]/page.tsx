import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LossCard from "@/components/LossCard";
import { IconArrow, IconExternal } from "@/components/Icons";
import { CHAINS, detectFamily } from "@/lib/chains";
import { money, moneyCompact, painUsd, short, usd } from "@/lib/format";
import { walletLosses } from "@/lib/store";
import { tierOf } from "@/lib/tier";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ address: string }> };

// Mesmos gradientes do avatar de token, escolhidos pelo endereço
const GRADIENTS = [
  "linear-gradient(140deg, #b9a7ff, #6f5ae6)",
  "linear-gradient(140deg, #ff94b8, #d9628f)",
  "linear-gradient(140deg, #8ee6c4, #2a9d75)",
  "linear-gradient(140deg, #ffd08a, #e0895a)",
  "linear-gradient(140deg, #9fd2ff, #4c84d9)",
];
const gradientOf = (a: string) => GRADIENTS[[...a].reduce((n, c) => n + c.charCodeAt(0), 0) % GRADIENTS.length];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  return { title: `Wallet ${short(address)}` };
}

export default async function WalletPage({ params }: Props) {
  const { address } = await params;
  const family = detectFamily(address);
  if (!family) notFound();

  const losses = await walletLosses(address);
  const first = losses[0];
  const chain = first ? CHAINS[first.chain] : CHAINS[family === "solana" ? "solana" : "ethereum"];
  const worst = losses.reduce<(typeof losses)[number] | null>((m, l) => (!m || l.amountUsd > m.amountUsd ? l : m), null);
  const biggest = worst?.amountUsd ?? 0;
  const missed = losses.filter((l) => l.kind === "missed").reduce((n, l) => n + l.amountUsd, 0);
  const realized = losses.filter((l) => l.kind === "realized").reduce((n, l) => n + l.amountUsd, 0);
  const respects = losses.reduce((n, l) => n + l.respects, 0);
  const tier = tierOf(biggest);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="size-16 shrink-0 rounded-full ring-1 ring-white/10" style={{ background: gradientOf(address) }} aria-hidden />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="truncate font-display text-2xl font-semibold sm:text-3xl">
              <span className="font-mono tracking-tight">{short(address)}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-dim">
              <span className="pill py-0.5 text-[11px]">
                <span className="size-1.5 rounded-full" style={{ background: chain.color }} />
                {family === "solana" ? "Solana" : "EVM"}
              </span>
              {losses.length > 0 && <span>{tier.name}</span>}
              <a href={chain.addressUrl(address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
                View on explorer <IconExternal className="size-3" />
              </a>
            </div>
          </div>
        </div>
        {losses.length > 0 && (
          <div className="flex flex-col sm:items-end">
            <span className="label">Biggest fumble</span>
            <span className="whitespace-nowrap font-sans text-3xl font-semibold leading-none tracking-[-0.03em] text-loss sm:text-4xl">{worst ? painUsd(worst.kind, biggest) : "—"}</span>
          </div>
        )}
      </header>

      {losses.length === 0 ? (
        <div className="surface flex flex-col items-start gap-4 p-8 sm:p-10">
          <p className="font-display text-2xl font-semibold">This wallet hasn't posted anything yet.</p>
          <p className="max-w-[48ch] text-dim">The scan is public, but only the wallet's owner can post the result to the feed.</p>
          <Link href="/scan" className="btn btn-primary h-11 px-5 text-sm">
            Run the scan
            <IconArrow />
          </Link>
        </div>
      ) : (
        <>
          <dl className="surface grid grid-cols-2 overflow-hidden md:grid-cols-4">
            {(
              [
                ["Left on the table", missed > 0 ? money(missed) : "—", "text-loss"],
                ["Realized loss", realized > 0 ? usd(realized) : "—", "text-loss"],
                ["Posts", String(losses.length), ""],
                ["Fs received", moneyCompact(respects).slice(1), ""],
              ] as const
            ).map(([k, v, cls], i) => (
              <div key={k} className={`flex min-w-0 flex-col gap-2 p-5 ${i % 2 === 0 ? "border-r border-line" : ""} ${i < 2 ? "border-b border-line md:border-b-0" : ""} ${i === 1 ? "md:border-r" : ""}`}>
                <dt className="label">{k}</dt>
                <dd className={`whitespace-nowrap font-sans text-2xl font-semibold leading-none tracking-[-0.02em] sm:text-3xl ${cls}`}>{v}</dd>
              </div>
            ))}
          </dl>

          <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
            {losses.map((l, i) => (
              <LossCard key={l.id} loss={l} delay={Math.min(i, 8) * 70} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
