import Link from "next/link";
import { IconArrow } from "@/components/Icons";

export const metadata = {
  title: "How the math works",
  description: "Where LossPornHub's numbers come from: left on the table, realized loss, data sources and what's left out.",
};

const FAQ = [
  {
    q: "Is it safe to paste my wallet?",
    a: "Yes. The scan only reads the public history on the blockchain, the same thing any explorer shows. We never ask for a seed phrase, a password or permission to spend anything.",
  },
  {
    q: "Why do I need to sign to post?",
    a: "The signature proves the wallet is yours, so nobody can post someone else's fumble. It's a signed text message: not a transaction, costs no gas and gives access to nothing.",
  },
  {
    q: "Are the numbers exact?",
    a: "What was sold and what was received come from the blockchain. The dollar value of a sell made in SOL or ETH uses that day's close, not the price at the minute. Today's price comes from the most liquid pair on DexScreener.",
  },
  {
    q: "I sold on Binance. Does it show up?",
    a: "No. Only DEX swaps count (Jupiter, Raydium, Uniswap and friends). A sell on an exchange happens off-chain.",
  },
  {
    q: "Can I delete a post?",
    a: "Not yet. Think before you sign. The caption is optional, the number isn't.",
  },
];

export default function About() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-14">
      <div className="flex flex-col items-start gap-5">
        <span className="pill">Methodology</span>
        <h1 className="font-display text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.06]">
          How the math <span className="grad-text">works</span>
        </h1>
        <p className="max-w-[56ch] text-lg leading-relaxed text-dim">
          Two numbers, both taken from what the wallet did on the blockchain. Nothing is typed by hand.
        </p>
      </div>

      <section className="grid gap-5 sm:grid-cols-2">
        <div className="surface flex flex-col gap-3 p-6">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-loss">Left on the table</span>
          <p className="font-display text-xl font-semibold leading-snug">What the tokens you sold would be worth today, minus what you got for them.</p>
          <p className="text-sm leading-relaxed text-dim">
            For every token sold: <span className="font-mono text-fg">amount sold × today's price − dollars received</span>. Positive means you
            sold too early. Negative means you sold well, and we congratulate you.
          </p>
        </div>
        <div className="surface flex flex-col gap-3 p-6">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-loss">Realized loss</span>
          <p className="font-display text-xl font-semibold leading-snug">What you paid above what you got back, on tokens you bought and sold.</p>
          <p className="text-sm leading-relaxed text-dim">
            Uses the average cost of the buys that show up in the history: <span className="font-mono text-fg">received on sells − average cost × amount sold</span>.
            It only counts when the buy also went through the wallet.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="font-display text-2xl font-semibold">Where the data comes from</h2>
        <ul className="surface divide-y divide-line">
          {[
            ["Solana swaps", "Helius, which already delivers every transaction decoded: what left the wallet and what came in."],
            ["EVM swaps", "Etherscan, on Ethereum, Base, Arbitrum, Optimism, Polygon and BNB. We join the token transfers and the ETH of each transaction."],
            ["Dollar value at the time of the sell", "The stablecoin side counts 1:1. The SOL, ETH, BNB or POL side uses that day's close on Binance."],
            ["Today's price", "DexScreener, using the most liquid pair. A token with no listed pair gets no price and stays out of the math."],
          ].map(([k, v]) => (
            <li key={k} className="grid gap-1 px-6 py-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6">
              <span className="text-sm font-medium">{k}</span>
              <span className="text-sm leading-relaxed text-dim">{v}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="font-display text-2xl font-semibold">What's left out</h2>
        <ul className="flex flex-col gap-3 text-[15px] leading-relaxed text-dim">
          {[
            "Stablecoins: selling USDC isn't selling early.",
            "Token-for-token swaps with no SOL, ETH or stablecoin on either side: there's no way to know the dollar value at the time. We tell you how many were skipped.",
            "Very active wallets: only the most recent swaps per network are read.",
            "Exchange sells, NFTs, staking and airdrops.",
          ].map((t) => (
            <li key={t} className="flex gap-3">
              <span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-lilac" aria-hidden />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="font-display text-2xl font-semibold">Questions everyone asks</h2>
        <div className="flex flex-col gap-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="surface group px-6 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <span className="shrink-0 text-dim transition-transform group-open:rotate-90">
                  <IconArrow className="size-4" />
                </span>
              </summary>
              <p className="pt-3 text-sm leading-relaxed text-dim">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="surface-glow flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-display text-lg font-semibold">Convinced? Paste your wallet.</p>
        <Link href="/scan" className="btn btn-primary h-11 px-5 text-sm">
          Scan my wallet
          <IconArrow />
        </Link>
      </div>
    </div>
  );
}
