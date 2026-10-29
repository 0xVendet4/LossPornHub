import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import LossCard from "@/components/LossCard";
import { CHAINS } from "@/lib/chains";
import { money, moneyCompact, painUsd, usd } from "@/lib/format";
import { AUTHOR_ID, authorName } from "@/lib/privacy";
import { authorLosses, profileInfo } from "@/lib/store";
import { IconLink } from "@/components/Icons";
import { tierOf } from "@/lib/tier";

export const dynamic = "force-dynamic";

// A pasta ainda se chama [address], mas o parâmetro é o apelido de quem postou (lib/author.ts), nunca a carteira
type Props = { params: Promise<{ address: string }> };

// Mesmos gradientes do avatar de token, escolhidos pelo apelido
const GRADIENTS = [
  "linear-gradient(140deg, #b9a7ff, #6f5ae6)",
  "linear-gradient(140deg, #ff94b8, #d9628f)",
  "linear-gradient(140deg, #8ee6c4, #2a9d75)",
  "linear-gradient(140deg, #ffd08a, #e0895a)",
  "linear-gradient(140deg, #9fd2ff, #4c84d9)",
];
const gradientOf = (a: string) => GRADIENTS[[...a].reduce((n, c) => n + c.charCodeAt(0), 0) % GRADIENTS.length];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address: author } = await params;
  return { title: AUTHOR_ID.test(author) ? authorName(author) : "Not found" };
}

export default async function AuthorPage({ params }: Props) {
  const { address: author } = await params;
  if (!AUTHOR_ID.test(author)) notFound();

  const [losses, profile] = await Promise.all([authorLosses(author), profileInfo(author)]);
  const first = losses[0];
  if (!first) {
    // Apelido antigo de uma carteira que foi juntada a um perfil
    if (profile.movedTo) redirect(`/w/${profile.movedTo}`);
    notFound();
  }
  const families = [...new Set(losses.map((l) => l.family))];
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
          <span className="size-16 shrink-0 rounded-full ring-1 ring-white/10" style={{ background: gradientOf(author) }} aria-hidden />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="truncate font-display text-2xl font-semibold sm:text-3xl">
              <span className="font-mono tracking-tight">{authorName(author)}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-dim">
              {families.map((f) => (
                <span key={f} className="pill py-0.5 text-[11px]">
                  <span className="size-1.5 rounded-full" style={{ background: f === "solana" ? CHAINS.solana.color : CHAINS.ethereum.color }} />
                  {f === "solana" ? "Solana" : "EVM"}
                </span>
              ))}
              <span>{tier.name}</span>
              <span aria-hidden>·</span>
              <span>{profile.wallets > 1 ? `${profile.wallets} wallets, all kept private` : "Wallet kept private"}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:items-end">
          <span className="label">Biggest fumble</span>
          <span className="whitespace-nowrap font-sans text-3xl font-semibold leading-none tracking-[-0.03em] text-loss sm:text-4xl">{worst ? painUsd(worst.kind, biggest) : "—"}</span>
        </div>
      </header>

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

      <Link href="/link" className="inline-flex items-center gap-1.5 self-center text-sm text-dim transition-colors hover:text-fg">
        <IconLink className="size-3.5" />
        Is this you? Link your other wallets to this name
      </Link>
    </div>
  );
}
