import Link from "next/link";
import LossCard from "@/components/LossCard";
import HeroPreview from "@/components/HeroPreview";
import CountUp from "@/components/CountUp";
import { IconArrow, IconCheck, IconFlame, IconLayers, IconSearch, IconTrendUp } from "@/components/Icons";
import { fumbleOfWeek, listLosses, stats, type Sort } from "@/lib/store";
import { painUsd } from "@/lib/format";
import { headline } from "@/lib/headline";
import { authorName } from "@/lib/privacy";

export const dynamic = "force-dynamic";

const TABS: { key: Sort; label: string }[] = [
  { key: "new", label: "Newest" },
  { key: "top", label: "Biggest" },
  { key: "respects", label: "Most F" },
];

const STEPS = [
  {
    icon: IconSearch,
    title: "Paste the address",
    text: "Any EVM or Solana wallet. Read-only: no need to connect or sign anything to look.",
  },
  {
    icon: IconLayers,
    title: "We read your swaps",
    text: "Ethereum, Base, Arbitrum, Polygon, BNB, Robinhood Chain and Solana. Every sell is compared with today's price.",
  },
  {
    icon: IconTrendUp,
    title: "See the scan and post it",
    text: "What you left on the table, what you actually lost and your worst fumble. Posting takes a wallet signature. No gas.",
  },
];

const PROMISES = ["Read-only, nothing to connect", "EVM and Solana", "Numbers straight from the blockchain"];

export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort: s } = await searchParams;
  const sort: Sort = s === "top" || s === "respects" ? s : "new";
  const [losses, st, week] = await Promise.all([listLosses(sort), stats(), fumbleOfWeek()]);
  const solShare = st.total > 0 ? Math.round((st.sol / st.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-20">
      <section className="relative grid items-center gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid-bg pointer-events-none absolute inset-x-0 -bottom-10 -top-24 -z-10" aria-hidden />
        <div className="flex flex-col items-start gap-7">
          <span className="pill">
            <span className="live-dot size-1.5 rounded-full bg-gain" />
            Paper hands scanner
          </span>
          <h1 className="font-display text-[clamp(2.4rem,5.4vw,3.9rem)] font-semibold leading-[1.05]">
            How much would you have if <span className="grad-text">you hadn't sold?</span>
          </h1>
          <p className="max-w-[46ch] text-lg leading-relaxed text-dim">
            Paste a wallet address. We read your swaps, compare every sell with today's price and show what you left on the
            table. And what you actually lost.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/scan" className="btn btn-primary h-12 px-6 text-[15px]">
              Scan my wallet
              <IconArrow />
            </Link>
            <Link href="/leaderboard" className="btn btn-ghost h-12 px-6 text-[15px]">
              Hall of Shame
            </Link>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-dim">
            {PROMISES.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <IconCheck className="size-3.5 text-lilac" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <HeroPreview />
      </section>

      <section className="flex flex-col gap-4" aria-label="How it works">
        <div className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="surface card-hover flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-lilac/15 text-lilac">
                <step.icon className="size-[18px]" />
              </span>
              <span className="text-xs font-medium text-dim">Step {i + 1}</span>
            </div>
            <span className="font-display text-base font-semibold">{step.title}</span>
            <p className="text-sm leading-relaxed text-dim">{step.text}</p>
          </div>
        ))}
        </div>
        <Link href="/about" className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-dim transition-colors hover:text-fg">
          How the math works, in detail
          <IconArrow className="size-3.5" />
        </Link>
      </section>

      <section className="surface grid grid-cols-3 overflow-hidden md:grid-cols-[1.7fr_1fr_1fr_1fr]">
        <div className="col-span-3 flex flex-col gap-3 border-b border-line p-6 md:col-span-1 md:border-b-0 md:border-r">
          <span className="label">Total damage posted</span>
          <span className="whitespace-nowrap font-sans text-[clamp(2rem,4vw,2.6rem)] font-semibold leading-none tracking-[-0.03em]">
            <CountUp value={st.total} format="money" />
          </span>
          {st.total > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex h-1.5 gap-[2px]" role="img" aria-label={`EVM ${100 - solShare}%, Solana ${solShare}%`}>
                {100 - solShare > 0 && <span className="rounded-full bg-evm" style={{ width: `${100 - solShare}%` }} />}
                {solShare > 0 && <span className="rounded-full bg-sol" style={{ width: `${solShare}%` }} />}
              </div>
              <div className="flex gap-4 text-xs text-dim">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-evm" />
                  EVM {100 - solShare}%
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-sol" />
                  Solana {solShare}%
                </span>
              </div>
            </div>
          )}
        </div>
        {(
          [
            ["Posts", st.count],
            ["Wallets", st.wallets],
            ["Fs paid", st.respects],
          ] as const
        ).map(([k, v], i) => (
          <div key={k} className={`flex min-w-0 flex-col justify-between gap-3 p-5 sm:p-6 ${i < 2 ? "border-r border-line" : ""}`}>
            <span className="label">{k}</span>
            <span className="font-sans text-3xl font-semibold leading-none tracking-[-0.02em] sm:text-4xl">
              <CountUp value={v} format="int" />
            </span>
          </div>
        ))}
      </section>

      {week && (
        <section className="surface-glow grid items-center gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_380px]" aria-label="Fumble of the week">
          <div className="flex flex-col items-start gap-4">
            <span className="pill text-loss">
              <IconFlame className="size-3.5" />
              Fumble of the week
            </span>
            <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.6rem)] font-semibold leading-tight">{headline(week)}</h2>
            <p className="max-w-[44ch] text-dim">
              The biggest post of the last 7 days, by {authorName(week.author)}.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={`/p/${week.id}`} className="btn btn-primary h-11 px-5 text-sm">
                See the post
                <IconArrow />
              </Link>
              <Link href="/leaderboard?period=7d" className="btn btn-ghost h-11 px-5 text-sm">
                This week's ranking
              </Link>
            </div>
          </div>
          <LossCard loss={week} />
        </section>
      )}

      <section className="flex flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-[clamp(1.75rem,3.5vw,2.4rem)] font-semibold leading-tight">Feed of pain</h2>
            <p className="text-dim">Every post came out of a wallet scan and was signed by the owner.</p>
          </div>
          <nav className="seg" aria-label="Sort posts">
            {TABS.map((t) => (
              <Link key={t.key} href={t.key === "new" ? "/" : `/?sort=${t.key}`} aria-current={sort === t.key ? "page" : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
        </div>

        {losses.length === 0 ? (
          <div className="surface flex flex-col items-start gap-4 p-8 sm:p-10">
            <p className="font-display text-2xl font-semibold">Nobody's had the guts yet.</p>
            <p className="text-dim">Scan your wallet and be the first to show what you left on the table.</p>
            <Link href="/scan" className="btn btn-primary h-11 px-5 text-sm">
              Scan wallet
              <IconArrow />
            </Link>
          </div>
        ) : (
          <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
            {losses.map((l, i) => (
              <LossCard key={l.id} loss={l} delay={Math.min(i, 8) * 70} />
            ))}
          </div>
        )}
        {st.biggest && (
          <p className="text-center text-sm text-dim">
            Biggest fumble so far: <span className="font-medium text-fg">{painUsd(st.biggest.kind, st.biggest.amountUsd)}</span> on $
            {st.biggest.token.toUpperCase()}.
          </p>
        )}
      </section>
    </div>
  );
}
