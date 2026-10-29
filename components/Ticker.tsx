import Link from "next/link";
import { listLosses } from "@/lib/store";
import { painUsd } from "@/lib/format";
import TokenAvatar from "./TokenAvatar";

export default async function Ticker() {
  const losses = await listLosses("new", 16);
  if (losses.length === 0) return null;

  const items = (k: string, hidden: boolean) =>
    losses.map((l) => (
      <Link
        key={k + l.id}
        href={`/p/${l.id}`}
        tabIndex={hidden ? -1 : undefined}
        className="inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-raise"
      >
        <TokenAvatar symbol={l.token} logo={l.logo} size={18} />
        <span className="font-medium text-fg">${l.token.toUpperCase()}</span>
        <span className="text-loss tabular-nums">{painUsd(l.kind, l.amountUsd)}</span>
      </Link>
    ));

  // A lista aparece duas vezes para a fita girar sem emenda
  const run = (key: string) => {
    const hidden = key === "b";
    return (
      <div key={key} className="flex shrink-0 items-center gap-6 pr-6" aria-hidden={hidden}>
        {items(key + "1", hidden)}
        {losses.length < 6 && items(key + "2", hidden)}
      </div>
    );
  };

  return (
    <div className="border-b border-line/70 bg-card/40">
      <div className="mx-auto flex h-11 max-w-6xl items-center gap-4 px-4 text-[13px] sm:px-6">
        <span className="flex shrink-0 items-center gap-2 font-medium text-dim">
          <span className="live-dot size-1.5 rounded-full bg-gain" />
          Live
        </span>
        <div className="min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <div className="tape flex w-max items-center">
            {run("a")}
            {run("b")}
          </div>
        </div>
      </div>
    </div>
  );
}
