"use client";

import { useEffect, useRef, useState } from "react";
import { CHAINS } from "@/lib/chains";
import { candlesMatch, peakAfter, peakWorthShowing } from "@/lib/candle-plot";
import { drawFrame, durationOf, type Scene } from "@/lib/timelapse";
import type { PublicLoss } from "@/lib/types";
import { candlesUrl, loadCandles } from "./CandleChart";
import { IconDownload, IconShare } from "./Icons";

export type Layout = "tall" | "wide";
export const SIZE: Record<Layout, [number, number]> = { tall: [1080, 1350], wide: [1920, 1080] };

const FPS = 30;
// H.264 nível 4.0 (cabe 1920×1080): High, Main e Baseline, nessa ordem. O Firefox codifica com o OpenH264,
// que só faz Baseline e às vezes só aceita a escrita sem as flags de restrição (42 00 xx)
const CODECS = ["avc1.640028", "avc1.4d0028", "avc1.42e028", "avc1.420028", "avc1.42001f"];
// Plano B quando o navegador não tem WebCodecs: gravar o canvas em tempo real (o Firefox antigo só grava WebM)
const TYPES = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"];

type State =
  | { step: "idle" }
  | { step: "working"; label: string }
  | { step: "done"; url: string; ext: string; file: File; why?: string }
  | { step: "error"; message: string };

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

    const peak = peakAfter(candles, loss.lastSellAt!);
    const scene: Scene = {
      candles,
      peak: peak && peakWorthShowing(peak.price, nowPrice) ? peak : undefined,
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
    const duration = durationOf(scene);
    drawFrame(ctx, W, H, scene, 0);

    const mp4 = await encodeMp4(el, duration, (t) => drawFrame(ctx, W, H, scene, t), (done) =>
      setState({ step: "working", label: `Making the video… ${Math.round(done * 100)}%` }),
    ).catch((e) => String(e?.message || e));
    if (mp4 instanceof Blob) {
      finish(mp4, "mp4");
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
        drawFrame(ctx, W, H, scene, Math.min(t, duration));
        const label = `Recording… ${Math.max(0, Math.ceil(duration - t))}s`;
        setState((s) => (s.step === "working" && s.label !== label ? { step: "working", label } : s));
        if (t >= duration + 0.2) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    rec.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());

    const mime = rec.mimeType || type || "video/webm";
    finish(new Blob(chunks, { type: mime }), mime.includes("mp4") ? "mp4" : "webm", mp4);
  }

  function finish(blob: Blob, ext: string, why?: string) {
    const name = `losspornhub-${loss.token.toLowerCase()}.${ext}`;
    setState({ step: "done", url: URL.createObjectURL(blob), ext, file: new File([blob], name, { type: blob.type }), why });
  }

  // No celular, "Baixar" de um blob nem sempre vai para a galeria; o menu de compartilhar tem "Salvar vídeo"
  const canShare =
    state.step === "done" &&
    typeof navigator !== "undefined" &&
    !!navigator.canShare?.({ files: [state.file] }) &&
    window.matchMedia("(pointer: coarse)").matches;
  async function share() {
    if (state.step !== "done") return;
    await navigator.share({ files: [state.file] }).catch(() => {});
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
          <>
            {canShare && (
              <button type="button" onClick={share} className="btn btn-primary h-12 gap-2 px-5 text-[15px]">
                <IconShare className="size-4" />
                Save or share video
              </button>
            )}
            <a href={state.url} download={state.file.name} className="btn btn-ghost h-12 gap-2 px-5 text-[15px]">
              <IconDownload className="size-4" />
              Download video ({state.ext.toUpperCase()})
            </a>
          </>
        ) : (
          <button type="button" onClick={make} disabled={busy} className="btn btn-ghost h-12 gap-2 px-5 text-[15px]">
            <PlayIcon />
            {state.step === "working" ? state.label : "Make a video"}
          </button>
        )}
        {busy && <span className="text-sm text-dim">Keep this tab open.</span>}
        {state.step === "done" && state.ext === "webm" && (
          <span className="text-sm text-dim">
            This browser could only save WebM, which X doesn&apos;t accept. Chrome, Edge or Safari save MP4.
            {state.why && <span className="block text-xs opacity-70">MP4 failed: {state.why}</span>}
          </span>
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
 * Sem WebCodecs ou sem H.264, devolve o motivo em texto e o vídeo é gravado com o MediaRecorder.
 */
async function encodeMp4(el: HTMLCanvasElement, duration: number, draw: (t: number) => void, progress: (done: number) => void): Promise<Blob | string> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return "this browser has no WebCodecs";
  const { width, height } = el;
  // Primeiro o codificador da placa de vídeo; se ele recusar o tamanho (alguns pedem múltiplos de 16) ou falhar
  // no meio, o de software (OpenH264 no Chrome e no Firefox) faz o mesmo MP4, só que mais devagar
  const configs: VideoEncoderConfig[] = [];
  for (const hardwareAcceleration of ["no-preference", "prefer-software"] as const) {
    const c = await firstSupported(width, height, hardwareAcceleration);
    if (c) configs.push(c);
  }
  if (configs.length === 0) return "no H.264 encoder in this browser";
  let why = "";
  for (const config of configs) {
    try {
      return await encodeWith(config, el, duration, draw, progress);
    } catch (e) {
      why = `${config.codec}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return why;
}

async function firstSupported(width: number, height: number, hardwareAcceleration: HardwareAcceleration) {
  for (const codec of CODECS) {
    const c: VideoEncoderConfig = { codec, width, height, bitrate: 8_000_000, framerate: FPS, avc: { format: "avc" }, hardwareAcceleration };
    if ((await VideoEncoder.isConfigSupported(c).catch(() => null))?.supported) return c;
  }
  return null;
}

async function encodeWith(config: VideoEncoderConfig, el: HTMLCanvasElement, duration: number, draw: (t: number) => void, progress: (done: number) => void) {
  const { width, height } = el;
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  // fastStart "in-memory" põe o índice no começo do arquivo: o X recusa MP4 com o índice no fim
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width, height, frameRate: FPS }, fastStart: "in-memory" });
  let failure: unknown = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) });
  try {
    encoder.configure(config);
    const frames = Math.ceil(duration * FPS) + 6;
    for (let i = 0; i < frames; i++) {
      if (failure) throw failure;
      draw(Math.min(i / FPS, duration));
      const frame = new VideoFrame(el, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      // Não deixa a fila do codificador crescer, e dá um respiro para a tela mostrar o progresso
      while (encoder.encodeQueueSize > 6 && !failure) await new Promise((r) => setTimeout(r, 4));
      if (i % 8 === 0) {
        progress(i / frames);
        await new Promise((r) => setTimeout(r));
      }
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
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
