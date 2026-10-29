"use client";

import { useEffect, useRef, useState } from "react";
import { CHAINS } from "@/lib/chains";
import { short } from "@/lib/format";
import { candlesMatch } from "@/lib/candle-plot";
import { DURATION, drawFrame, type Scene } from "@/lib/timelapse";
import type { PublicLoss } from "@/lib/types";
import { candlesUrl, loadCandles } from "./CandleChart";
import { IconDownload } from "./Icons";

export type Layout = "tall" | "wide";
export const SIZE: Record<Layout, [number, number]> = { tall: [1080, 1350], wide: [1920, 1080] };

// MP4 primeiro: o X e o Instagram não aceitam WebM. Chrome e Safari recentes gravam MP4; o Firefox só WebM.
const TYPES = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"];

type State = { step: "idle" } | { step: "recording"; left: number } | { step: "done"; url: string; ext: string } | { step: "error"; message: string };

/**
 * Vídeo timelapse do gráfico: da venda até hoje, com o valor deixado na mesa subindo.
 * É gravado no próprio navegador, em tempo real, a partir de um canvas.
 */
export default function VideoMaker({ loss, demo, layout, children }: { loss: PublicLoss; demo: boolean; layout: Layout; children?: React.ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<State>({ step: "idle" });
  const [W, H] = SIZE[layout];

  // Trocar o formato ou o post invalida o vídeo já gravado
  useEffect(() => setState({ step: "idle" }), [layout, loss.target]);
  useEffect(() => () => void (state.step === "done" && URL.revokeObjectURL(state.url)), [state]);

  const qty = loss.soldAmount ?? 0;
  // Só "deixou na mesa" de um token tem gráfico para virar vídeo; nos outros fica só o botão do card
  if (loss.kind !== "missed" || !loss.tokenAddress || !loss.lastSellAt || !qty || loss.soldUsd === undefined || loss.valueNowUsd === undefined)
    return <div className="flex flex-wrap items-center gap-3">{children}</div>;
  const sellPrice = loss.soldUsd / qty;
  const nowPrice = loss.valueNowUsd / qty;

  async function make() {
    const el = canvas.current;
    if (!el || typeof MediaRecorder === "undefined" || !el.captureStream) {
      setState({ step: "error", message: "This browser can't record video. Try Chrome or Safari on a computer." });
      return;
    }
    setState({ step: "recording", left: Math.ceil(DURATION) });
    const src = { chain: loss.chain, token: loss.tokenAddress!, pool: loss.pool, since: loss.lastSellAt!, demo };
    const candles = await loadCandles(candlesUrl(src, sellPrice, nowPrice));
    if (!candlesMatch(candles, nowPrice)) {
      setState({ step: "error", message: "Couldn't load the price candles for this token, so there's no video for it." });
      return;
    }

    const css = getComputedStyle(document.documentElement);
    const fonts = { display: css.getPropertyValue("--font-sora").trim() || "sans-serif", sans: css.getPropertyValue("--font-figtree").trim() || "sans-serif" };
    await Promise.all([document.fonts.load(`700 40px ${fonts.display}`), document.fonts.load(`600 30px ${fonts.sans}`), document.fonts.load(`400 30px ${fonts.sans}`)]).catch(() => {});

    const scene: Scene = {
      candles,
      sellAt: loss.lastSellAt!,
      sellPrice,
      symbol: loss.token,
      chainName: CHAINS[loss.chain].name,
      chainColor: CHAINS[loss.chain].color,
      wallet: short(loss.wallet),
      amountUsd: loss.amountUsd,
      soldAmount: qty,
      soldUsd: loss.soldUsd!,
      host: window.location.host,
      fonts,
    };
    const ctx = el.getContext("2d")!;
    drawFrame(ctx, W, H, scene, 0);

    const stream = el.captureStream(30);
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start(250);

    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        drawFrame(ctx, W, H, scene, Math.min(t, DURATION));
        setState((s) => (s.step === "recording" && s.left !== Math.ceil(DURATION - t) ? { step: "recording", left: Math.max(0, Math.ceil(DURATION - t)) } : s));
        if (t >= DURATION + 0.2) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    rec.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());

    const mime = rec.mimeType || type || "video/webm";
    const blob = new Blob(chunks, { type: mime });
    setState({ step: "done", url: URL.createObjectURL(blob), ext: mime.includes("mp4") ? "mp4" : "webm" });
  }

  const busy = state.step === "recording";
  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvas}
        width={W}
        height={H}
        className={`w-full rounded-2xl border border-line ${busy ? "" : "hidden"}`}
        style={{ aspectRatio: `${W} / ${H}`, maxWidth: layout === "tall" ? 360 : 560 }}
      />
      {state.step === "done" && (
        <video src={state.url} controls autoPlay loop muted playsInline className="w-full rounded-2xl border border-line" style={{ maxWidth: layout === "tall" ? 360 : 560 }} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        {children}
        {state.step === "done" ? (
          <a href={state.url} download={`losspornhub-${loss.token.toLowerCase()}.${state.ext}`} className="btn btn-ghost h-12 gap-2 px-5 text-[15px]">
            <IconDownload className="size-4" />
            Download video
          </a>
        ) : (
          <button type="button" onClick={make} disabled={busy} className="btn btn-ghost h-12 gap-2 px-5 text-[15px]">
            <PlayIcon />
            {busy ? `Recording… ${state.left}s` : "Make a video"}
          </button>
        )}
        {busy && <span className="text-sm text-dim">Keep this tab open while it records.</span>}
        {state.step === "done" && state.ext === "webm" && (
          <span className="text-sm text-dim">Saved as WebM, which X doesn't accept. Chrome or Safari save MP4.</span>
        )}
        {state.step === "done" && (
          <button type="button" onClick={make} className="text-sm font-medium text-lilac underline-offset-4 hover:underline">
            Record again
          </button>
        )}
      </div>
      {state.step === "error" && <p className="text-sm text-loss">{state.message}</p>}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
    </svg>
  );
}
