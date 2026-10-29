"use client";

import { useEffect, useRef, useState } from "react";
import { CHAINS } from "@/lib/chains";
import { candlesMatch } from "@/lib/candle-plot";
import { DURATION, drawFrame, type Scene } from "@/lib/timelapse";
import type { PublicLoss } from "@/lib/types";
import { candlesUrl, loadCandles } from "./CandleChart";
import { IconDownload } from "./Icons";

export type Layout = "tall" | "wide";
export const SIZE: Record<Layout, [number, number]> = { tall: [1080, 1350], wide: [1920, 1080] };

const FPS = 30;
// H.264 nível 4.0 (cabe 1920×1080): High, Main e Baseline, nessa ordem
const CODECS = ["avc1.640028", "avc1.4d0028", "avc1.42e028"];
// Plano B quando o navegador não tem WebCodecs: gravar o canvas em tempo real (o Firefox antigo só grava WebM)
const TYPES = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"];

type State = { step: "idle" } | { step: "working"; label: string } | { step: "done"; url: string; ext: string } | { step: "error"; message: string };

/**
 * Vídeo timelapse do gráfico: da venda até hoje, com o valor deixado na mesa subindo. Feito no próprio navegador:
 * cada quadro é desenhado no canvas e codificado em H.264 num MP4 (o X e o Instagram não aceitam WebM).
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
    if (!el) return;
    setState({ step: "working", label: "Loading the chart…" });
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
      amountUsd: loss.amountUsd,
      soldAmount: qty,
      soldUsd: loss.soldUsd!,
      host: window.location.host,
      fonts,
    };
    const ctx = el.getContext("2d")!;
    drawFrame(ctx, W, H, scene, 0);

    const mp4 = await encodeMp4(el, (t) => drawFrame(ctx, W, H, scene, t), (done) =>
      setState({ step: "working", label: `Making the video… ${Math.round(done * 100)}%` }),
    ).catch(() => null);
    if (mp4) {
      setState({ step: "done", url: URL.createObjectURL(mp4), ext: "mp4" });
      return;
    }

    if (typeof MediaRecorder === "undefined" || !el.captureStream) {
      setState({ step: "error", message: "This browser can't make video. Try Chrome, Edge or Safari." });
      return;
    }
    const stream = el.captureStream(FPS);
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
        const label = `Recording… ${Math.max(0, Math.ceil(DURATION - t))}s`;
        setState((s) => (s.step === "working" && s.label !== label ? { step: "working", label } : s));
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

  const busy = state.step === "working";
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
            {state.step === "working" ? state.label : "Make a video"}
          </button>
        )}
        {busy && <span className="text-sm text-dim">Keep this tab open.</span>}
        {state.step === "done" && state.ext === "webm" && (
          <span className="text-sm text-dim">This browser could only save WebM, which X doesn't accept. Chrome, Edge or Safari save MP4.</span>
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

/**
 * Codifica o vídeo quadro a quadro com WebCodecs, mais rápido que o tempo real e sempre em MP4.
 * null quando o navegador não tem WebCodecs ou não codifica H.264; aí o vídeo é gravado com o MediaRecorder.
 */
async function encodeMp4(el: HTMLCanvasElement, draw: (t: number) => void, progress: (done: number) => void): Promise<Blob | null> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
  const { width, height } = el;
  let config: VideoEncoderConfig | undefined;
  for (const codec of CODECS) {
    const c: VideoEncoderConfig = { codec, width, height, bitrate: 8_000_000, framerate: FPS, avc: { format: "avc" } };
    if ((await VideoEncoder.isConfigSupported(c).catch(() => null))?.supported) {
      config = c;
      break;
    }
  }
  if (!config) return null;

  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  // fastStart "in-memory" põe o índice no começo do arquivo: o X recusa MP4 com o índice no fim
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width, height, frameRate: FPS }, fastStart: "in-memory" });
  let failure: unknown = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) });
  encoder.configure(config);

  const frames = Math.ceil(DURATION * FPS) + 6;
  for (let i = 0; i < frames; i++) {
    if (failure) throw failure;
    draw(Math.min(i / FPS, DURATION));
    const frame = new VideoFrame(el, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    // Não deixa a fila do codificador crescer, e dá um respiro para a tela mostrar o progresso
    while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    if (i % 8 === 0) {
      progress(i / frames);
      await new Promise((r) => setTimeout(r));
    }
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
    </svg>
  );
}
