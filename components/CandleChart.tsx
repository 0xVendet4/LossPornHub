"use client";

import { useEffect, useRef, useState } from "react";
import type { ChainKey } from "@/lib/chains";
import type { Candle } from "@/lib/candles";
import { candlesMatch, peakWorthShowing, plotCandles } from "@/lib/candle-plot";
import { date, money, multiple, price } from "@/lib/format";
import { fuzz } from "@/lib/privacy";
import MoveChart, { MoveCaption } from "./MoveChart";

/** De onde vêm os candles: o token, o par e a hora da venda. `demo` usa candles inventados (carteira de exemplo). */
export type CandleSource = { chain: ChainKey; token: string; pool?: string; since: number; demo?: boolean };

export function candlesUrl(src: CandleSource, from: number, to: number) {
  const q = new URLSearchParams({ chain: src.chain, token: src.token, since: String(Math.floor(src.since)) });
  if (src.pool) q.set("pool", src.pool);
  if (src.demo) {
    q.set("demo", "1");
    q.set("from", String(from));
    q.set("to", String(to));
  }
  return `/api/candles?${q}`;
}

// Uma busca por URL, dividida entre o gráfico, a prévia do post e o vídeo
const requests = new Map<string, Promise<Candle[]>>();
export function loadCandles(url: string): Promise<Candle[]> {
  let job = requests.get(url);
  if (!job) {
    job = fetch(url)
      .then((r) => (r.ok ? r.json() : { candles: [] }))
      .then((d) => (Array.isArray(d.candles) ? (d.candles as Candle[]) : []))
      .catch(() => []);
    job.then((cs) => cs.length === 0 && requests.delete(url));
    requests.set(url, job);
  }
  return job;
}

/** `undefined` enquanto carrega; lista vazia quando não há candles. */
export function useCandles(src: CandleSource | null, from: number, to: number, enabled = true) {
  const url = src ? candlesUrl(src, from, to) : null;
  const [state, setState] = useState<{ url: string; candles: Candle[] } | null>(null);
  useEffect(() => {
    if (!url || !enabled) return;
    let live = true;
    loadCandles(url).then((candles) => live && setState({ url, candles }));
    return () => {
      live = false;
    };
  }, [url, enabled]);
  if (!url) return [];
  return state?.url === url ? state.candles : undefined;
}

/**
 * Candles do token desde um pouco antes da venda até hoje, com a venda marcada.
 * Sem candles (token sem pool, API fora), cai no gráfico de dois pontos.
 */
export default function CandleChart({
  source,
  from,
  to,
  fromLabel,
  toLabel,
  id,
  mult,
  soldUsd,
}: {
  source: CandleSource;
  from: number;
  to: number;
  fromLabel: string;
  toLabel: string;
  id: string;
  mult?: number | null;
  /** Com o valor vendido, o gráfico mostra quanto isso chegou a valer no pico depois da venda. */
  soldUsd?: number;
}) {
  // Só busca quando o gráfico chega perto da tela: o feed tem muitos cards e a API dos candles tem limite por minuto
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setNear(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const candles = useCandles(source, from, to, near);
  if (candles && !candlesMatch(candles, to)) return <MoveChart from={from} to={to} fromLabel={fromLabel} toLabel={toLabel} id={id} mult={mult} />;

  const ring = "var(--chart-surface, var(--color-card))";
  const plot = candles ? plotCandles(candles, source.since, from, { x: 3, y: 6, w: 314, h: 84 }) : null;
  const peak = plot?.peak && peakWorthShowing(plot.peak.price, to) ? plot.peak : null;

  return (
    <figure ref={ref} className="flex flex-col gap-3">
      <svg viewBox="0 0 320 100" className="h-auto w-full overflow-visible" role="img" aria-label={`Price candles. ${fromLabel} ${price(from)}, ${toLabel} ${price(to)}`}>
        <line x1="0" x2="320" y1="96" y2="96" stroke="var(--color-line)" strokeWidth="1" />
        {plot ? (
          <>
            <line x1={plot.sell.x} x2="320" y1={plot.sell.y} y2={plot.sell.y} stroke="var(--color-dim)" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="3 4" />
            <line x1={plot.sell.x} x2={plot.sell.x} y1="2" y2="96" stroke="var(--color-dim)" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="2 3" />
            {plot.bars.map((b, i) => {
              const color = b.up ? "var(--color-gain)" : "var(--color-loss)";
              return (
                <g key={i} className="fade" style={{ animationDelay: `${i * 12}ms` }}>
                  <line x1={b.x} x2={b.x} y1={b.high} y2={b.low} stroke={color} strokeWidth="0.8" />
                  <rect x={b.x - b.w / 2} y={Math.min(b.open, b.close)} width={b.w} height={Math.max(0.8, Math.abs(b.close - b.open))} fill={color} rx="0.4" />
                </g>
              );
            })}
            <g className="fade" style={{ animationDelay: `${plot.bars.length * 12}ms` }}>
              <circle cx={plot.sell.x} cy={plot.sell.y} r="4" fill="var(--color-dim)" stroke={ring} strokeWidth="2" />
              <circle cx={plot.last.x} cy={plot.last.y} r="4.5" fill="var(--color-loss)" stroke={ring} strokeWidth="2" />
              {peak && <circle cx={peak.x} cy={peak.y} r="3.5" fill="var(--color-lilac)" stroke={ring} strokeWidth="2" />}
            </g>
          </>
        ) : (
          <rect x="0" y="6" width="320" height="84" rx="10" fill="var(--color-line)" opacity="0.35" className="animate-pulse" />
        )}
      </svg>
      <MoveCaption from={from} to={to} fromLabel={fromLabel} toLabel={toLabel} mult={mult} />
      {peak && soldUsd !== undefined && (
        <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
          <span className="flex items-center gap-1.5 text-dim">
            <span className="size-2 rounded-full bg-lilac" aria-hidden />
            Worth at the peak, {date(peak.at)}
          </span>
          <span className="flex items-center gap-1.5 font-medium tabular-nums">
            {money(fuzz((soldUsd * peak.price) / from)!)}
            <span className="rounded-full bg-lilac/15 px-1.5 py-px text-[11px] font-semibold text-lilac">{multiple(peak.price / from)}</span>
          </span>
        </p>
      )}
    </figure>
  );
}
