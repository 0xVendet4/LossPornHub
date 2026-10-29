import Link from "next/link";
import { leaderboard, type LeaderRow } from "@/lib/store";
import { CHAINS, isChainKey } from "@/lib/chains";
import { painUsd } from "@/lib/format";
import { authorName } from "@/lib/privacy";
import { tierOf } from "@/lib/tier";
import TokenAvatar from "@/components/TokenAvatar";
import { IconArrow } from "@/components/Icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hall of Shame · LossPornHub" };

// "$WIF" fica como está; "whole wallet" ganha só a inicial maiúscula
const tokenLabel = (t: string) => (t.startsWith("$") ? t : t.charAt(0).toUpperCase() + t.slice(1));
const chainOf = (row: LeaderRow) => (isChainKey(row.chain) ? CHAINS[row.chain] : CHAINS.ethereum);

// No celular o pódio fica em ordem (1, 2, 3); a partir do sm vira 2, 1, 3 com o primeiro no meio
const PODIUM = [
  { place: 1, order: "order-2 sm:order-1", lift: "sm:mt-10" },
  { place: 0, order: "order-1 sm:order-2", lift: "" },
  { place: 2, order: "order-3", lift: "sm:mt-16" },
];

// Só o apelido: a carteira de quem postou nunca aparece no site
function Who({ row }: { row: LeaderRow }) {
  if (row.author === "example") return <span className="text-xs text-dim">{authorName(row.author)}</span>;
  return (
    <Link href={`/w/${row.author}`} className="font-mono text-xs text-dim hover:text-fg" title="See every post from this person">
      {authorName(row.author)}
    </Link>
  );
}

function NetPill({ row }: { row: LeaderRow }) {
  return (
    <span className="pill py-0.5 text-[11px]">
      <span className="size-1.5 rounded-full" style={{ background: chainOf(row).color }} />
      {row.family === "solana" ? "Solana" : "EVM"}
    </span>
  );
}

export default async function Leaderboard() {
  const rows = await leaderboard();
  const max = rows[0]?.biggest ?? 1;
  const podium = rows.length >= 3;
  const rest = podium ? rows.slice(3) : rows;

  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col items-start gap-5">
        <span className="pill">Ranked by biggest fumble</span>
        <h1 className="font-display text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[1.04]">
          Hall of <span className="grad-text">Shame</span>
        </h1>
        <p className="max-w-[52ch] text-lg leading-relaxed text-dim">
          The wallets with the biggest posted fumble, whether it's profit left on the table or an actual loss. Each wallet shows
          up once, by its worst post.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="surface flex flex-col items-start gap-4 p-8">
          <p className="font-display text-2xl font-semibold">Nobody on the podium yet.</p>
          <Link href="/scan" className="btn btn-primary h-11 px-5 text-sm">
            Take first place
            <IconArrow />
          </Link>
        </div>
      ) : (
        <>
          {podium && (
            <section className="grid items-start gap-4 sm:grid-cols-3 sm:gap-5" aria-label="Podium">
              {PODIUM.map(({ place, order, lift }) => {
                const row = rows[place];
                const first = place === 0;
                return (
                  <div
                    key={place}
                    className={`${order} ${lift} ${first ? "surface-glow" : "surface"} flex min-w-0 flex-col items-center gap-4 px-5 pb-6 pt-5 text-center`}
                  >
                    <span
                      className={`inline-flex size-8 items-center justify-center rounded-full font-display text-sm font-semibold ${
                        first ? "bg-gradient-to-br from-lilac to-rose text-[#17131f]" : "bg-raise text-dim"
                      }`}
                    >
                      {["1st", "2nd", "3rd"][place]}
                    </span>
                    <TokenAvatar symbol={row.biggestSymbol} logo={row.biggestLogo} size={first ? 64 : 52} />
                    <div className="flex min-w-0 max-w-full flex-col items-center gap-1">
                      <span className="max-w-full truncate text-sm font-semibold">{tokenLabel(row.biggestToken)}</span>
                      <span
                        className={`whitespace-nowrap font-sans font-semibold leading-none tracking-[-0.03em] text-loss ${
                          first ? "text-[clamp(1.9rem,3.4vw,2.5rem)]" : "text-[clamp(1.5rem,2.6vw,1.9rem)]"
                        }`}
                      >
                        {painUsd(row.biggestKind, row.biggest)}
                      </span>
                      <span className="text-[13px] text-dim">{tierOf(row.biggest).name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Who row={row} />
                      <NetPill row={row} />
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {rest.length > 0 && (
            <ol className="surface flex flex-col overflow-hidden">
              {rest.map((row, i) => {
                const rank = (podium ? 4 : 1) + i;
                return (
                  <li
                    key={`${rank}-${row.author}`}
                    className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-line px-4 py-4 transition-colors last:border-b-0 hover:bg-raise/40 sm:grid-cols-[2rem_auto_minmax(0,1fr)_8.5rem_4.5rem] sm:px-6"
                  >
                    <span className="text-sm font-medium text-dim tabular-nums">{rank}</span>
                    <span className="hidden sm:block">
                      <TokenAvatar symbol={row.biggestSymbol} logo={row.biggestLogo} size={36} />
                    </span>
                    <div className="flex min-w-0 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="text-sm font-semibold">{tokenLabel(row.biggestToken)}</span>
                        <Who row={row} />
                        <NetPill row={row} />
                      </div>
                      <div className="h-1.5 rounded-full bg-loss/15">
                        <div className="h-full rounded-full bg-loss" style={{ width: `${Math.max(2, (row.biggest / max) * 100)}%` }} />
                      </div>
                    </div>
                    <span className="whitespace-nowrap text-right font-semibold tabular-nums text-loss sm:text-lg">{painUsd(row.biggestKind, row.biggest)}</span>
                    <span className="hidden text-right text-xs text-dim sm:block">
                      {row.count} post{row.count === 1 ? "" : "s"}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
