import { demoReport } from "@/lib/scan/demo";
import { money, multiple, price } from "@/lib/format";
import TokenAvatar from "./TokenAvatar";
import { IconTrendUp } from "./Icons";
import CountUp from "./CountUp";

/** Um raio-x de exemplo, no formato de tela de carteira. Os dados são os da carteira fictícia do /scan. */
export default function HeroPreview() {
  const report = demoReport();
  const rows = report.tokens.filter((t) => (t.missedUsd ?? 0) > 0).slice(0, 4);
  const worst = rows[0];

  return (
    <div className="relative mx-auto w-full max-w-[420px] lg:mr-0">
      <div className="pointer-events-none absolute -inset-10 -z-10 hidden sm:block rounded-full bg-[radial-gradient(closest-side,rgb(185_167_255_/_0.22),transparent)]" aria-hidden />

      <div className="surface-glow flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="size-8 rounded-full bg-gradient-to-br from-lilac to-rose" aria-hidden />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">Example wallet</span>
              <span className="font-mono text-[11px] text-dim">Solana · {report.swapCount} swaps</span>
            </div>
          </div>
          <span className="pill">Example</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-dim">Left on the table by selling early</span>
          <span className="whitespace-nowrap font-sans text-[2.9rem] font-semibold leading-none tracking-[-0.035em]">
            <CountUp value={report.totals.missedUsd} format="money" />
          </span>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-loss">
            <IconTrendUp />
            {rows.length} tokens went up after you sold
          </span>
        </div>

        <ul className="flex flex-col gap-1 rounded-2xl bg-raise/60 p-1.5">
          {rows.map((t) => (
            <li key={t.key} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5">
              <TokenAvatar symbol={t.symbol} logo={t.logo} size={36} />
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="text-sm font-semibold">${t.symbol}</span>
                <span className="truncate text-xs text-dim">
                  {price(t.avgSellPrice)} → {price(t.priceNow!)}
                </span>
              </div>
              <div className="flex flex-col items-end leading-tight">
                <span className="text-sm font-semibold tabular-nums text-loss">{money(t.missedUsd!)}</span>
                <span className="text-xs text-dim tabular-nums">{multiple(t.multiple!)}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {worst && (
        <div className="float surface absolute -bottom-6 -left-4 hidden items-center gap-3 rounded-2xl py-2.5 pl-2.5 pr-4 sm:flex lg:-left-10">
          <TokenAvatar symbol={worst.symbol} logo={worst.logo} size={32} />
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] text-dim">Worst sell</span>
            <span className="text-sm font-semibold">
              ${worst.symbol} <span className="text-loss">{multiple(worst.multiple!)}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
