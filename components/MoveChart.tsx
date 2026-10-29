import { multiple as fmtMultiple, price } from "@/lib/format";

/**
 * Dois pontos reais: preço na venda e preço de hoje (ou compra → venda).
 * A linha é reta de propósito: não inventamos o caminho entre eles.
 * A linha tracejada é o preço de partida; a área entre ela e a linha é a diferença que a pessoa sentiu.
 * O anel dos pontos usa a cor da superfície onde o gráfico está (--chart-surface).
 */
export default function MoveChart({
  from,
  to,
  fromLabel,
  toLabel,
  id,
  mult,
}: {
  from: number;
  to: number;
  fromLabel: string;
  toLabel: string;
  id: string;
  mult?: number | null;
}) {
  const up = to >= from;
  const x1 = 12;
  const x2 = 308;
  const y1 = up ? 72 : 16;
  const y2 = up ? 16 : 72;
  const base = 92;
  const grad = `mc-${id}`;
  const ring = "var(--chart-surface, var(--color-card))";

  return (
    <figure className="flex flex-col gap-3">
      <svg viewBox="0 0 320 100" className="h-auto w-full overflow-visible" role="img" aria-label={`${fromLabel} ${price(from)}, ${toLabel} ${price(to)}`}>
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-loss)" stopOpacity={up ? 0.32 : 0.05} />
            <stop offset="1" stopColor="var(--color-loss)" stopOpacity={up ? 0.05 : 0.32} />
          </linearGradient>
        </defs>
        <line x1="0" x2="320" y1={base} y2={base} stroke="var(--color-line)" strokeWidth="1" />
        <line x1={x1} x2={x2} y1={y1} y2={y1} stroke="var(--color-dim)" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 4" />
        <path className="fade" style={{ animationDelay: "0.9s" }} d={`M${x1} ${y1} L${x2} ${y2} L${x2} ${y1} Z`} fill={`url(#${grad})`} />
        <path className="draw" pathLength={1} d={`M${x1} ${y1} L${x2} ${y2}`} fill="none" stroke="var(--color-loss)" strokeWidth="2" strokeLinecap="round" />
        <circle cx={x1} cy={y1} r="4.5" fill="var(--color-dim)" stroke={ring} strokeWidth="2" />
        <circle cx={x2} cy={y2} r="5.5" fill="var(--color-loss)" stroke={ring} strokeWidth="2" />
      </svg>
      <MoveCaption from={from} to={to} fromLabel={fromLabel} toLabel={toLabel} mult={mult} />
    </figure>
  );
}

/** Legenda embaixo do gráfico: preço de partida à esquerda, preço final à direita. */
export function MoveCaption({ from, to, fromLabel, toLabel, mult }: { from: number; to: number; fromLabel: string; toLabel: string; mult?: number | null }) {
  return (
    <figcaption className="flex items-start justify-between gap-3 text-[13px]">
      <span className="flex flex-col">
        <span className="text-dim">{fromLabel}</span>
        <span className="font-medium tabular-nums">{price(from)}</span>
      </span>
      <span className="flex flex-col items-end text-right">
        <span className="text-dim">{toLabel}</span>
        <span className="flex items-center gap-1.5 font-medium tabular-nums">
          {price(to)}
          {mult ? <span className="rounded-full bg-loss/15 px-1.5 py-px text-[11px] font-semibold text-loss">{fmtMultiple(mult)}</span> : null}
        </span>
      </span>
    </figcaption>
  );
}
