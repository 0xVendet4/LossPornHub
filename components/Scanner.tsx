"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignMessage } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { CHAINS, walletKey } from "@/lib/chains";
import { amount, date, money, multiple, price, short, usd } from "@/lib/format";
import { buildPostMessage } from "@/lib/message";
import { toPublic } from "@/lib/privacy";
import { draftFromReport } from "@/lib/scan/draft";
import type { Report, TokenStat } from "@/lib/scan/types";
import LossCard from "./LossCard";
import CountUp from "./CountUp";
import CandleChart from "./CandleChart";
import VideoMaker, { type Layout } from "./VideoMaker";
import TokenAvatar from "./TokenAvatar";
import { Badge, EvmButton, SolButton } from "./WalletButtons";
import { IconAlert, IconArrow, IconCheck, IconDownload, IconFlame, IconInfo, IconSearch, IconTrendUp } from "./Icons";

type ScanError = { error: string; code?: string; hosted?: boolean };

export default function Scanner() {
  const evm = useAccount();
  const sol = useWallet();
  const evmAddr = evm.address;
  const solAddr = sol.publicKey?.toBase58();

  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ScanError | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  // Preenche com a carteira conectada, se o campo estiver vazio
  useEffect(() => {
    if (!address && (evmAddr || solAddr)) setAddress((evmAddr || solAddr)!);
  }, [evmAddr, solAddr, address]);

  async function scan(wallet: string) {
    setLoading(true);
    setError(null);
    setReport(null);
    setTarget(null);
    try {
      const res = await fetch(`/api/scan?wallet=${encodeURIComponent(wallet.trim())}`);
      const text = await res.text();
      let data: Report | ScanError;
      try {
        data = JSON.parse(text);
      } catch {
        // Página de erro do Next (código que não compilou, servidor caiu no meio) em vez do JSON da API
        throw new Error(`The server answered ${res.status} with something that isn't JSON. Check the terminal where npm run dev is running.`);
      }
      if (!res.ok) setError(data as ScanError);
      else setReport(data as Report);
    } catch (err) {
      const network = err instanceof TypeError;
      setError({ error: network ? "Couldn't reach the server. Is npm run dev still running?" : (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (address.trim()) scan(address);
        }}
        className="surface flex flex-col gap-4 p-5 sm:p-6"
      >
        <label htmlFor="wallet" className="label">
          Wallet address, EVM or Solana
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="field flex min-w-0 flex-1 items-center gap-3 px-4">
            <IconSearch className="size-5 shrink-0 text-dim" />
            <input
              id="wallet"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x… or Solana address"
              spellCheck={false}
              autoComplete="off"
              className="h-13 min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-dim/60"
            />
          </div>
          <button disabled={loading || !address.trim()} className="btn btn-primary h-13 px-7 text-[15px]">
            {loading ? "Reading…" : "Scan"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-dim">
          <span>Use my wallet</span>
          {evmAddr ? <Chip onClick={() => setAddress(evmAddr)} kind="evm" text={short(evmAddr)} /> : <EvmButton />}
          {solAddr ? <Chip onClick={() => setAddress(solAddr)} kind="sol" text={short(solAddr)} /> : <SolButton />}
          <span className="mx-1">or</span>
          <button type="button" onClick={() => scan("demo")} className="font-medium text-lilac underline-offset-4 hover:underline">
            see an example
          </button>
        </div>
      </form>

      {loading && <Loading />}
      {error && <ErrorPanel error={error} onDemo={() => scan("demo")} />}
      {report && (
        <ReportView
          report={report}
          target={target}
          setTarget={setTarget}
          connected={report.family === "evm" ? evmAddr : solAddr}
        />
      )}
    </div>
  );
}

function Chip({ onClick, kind, text }: { onClick: () => void; kind: "evm" | "sol"; text: string }) {
  return (
    <button type="button" onClick={onClick} className="btn btn-ghost h-10 gap-2 px-3.5 text-sm">
      <Badge kind={kind} />
      <span className="live-dot size-1.5 rounded-full bg-gain" />
      <span className="font-mono text-xs">{text}</span>
    </button>
  );
}

const STEPS = ["Reading the swap history", "Fetching today's price for every token sold", "Measuring the regret"];

/** Esqueleto no formato do resultado, com os passos embaixo */
function Loading() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((n) => Math.min(n + 1, STEPS.length - 1)), 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fade flex flex-col gap-6" role="status" aria-live="polite">
      <div className="flex flex-wrap gap-2" aria-hidden>
        {[112, 72, 96, 150].map((w, i) => (
          <span key={i} className="skeleton h-7 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" aria-hidden>
        <div className="surface flex flex-col gap-5 p-6 sm:p-8">
          <span className="skeleton h-4 w-56 max-w-full" />
          <span className="skeleton h-16 w-3/4" />
          <span className="skeleton h-4 w-full" />
          <span className="skeleton h-4 w-2/3" />
        </div>
        <div className="grid content-start gap-5">
          <div className="surface flex flex-col gap-3 p-5">
            <span className="skeleton h-3.5 w-32" />
            <span className="skeleton h-10 w-40" />
            <span className="skeleton h-3.5 w-full" />
          </div>
          <div className="grid grid-cols-2 gap-5">
            {[0, 1].map((i) => (
              <div key={i} className="surface flex flex-col gap-3 p-5">
                <span className="skeleton h-3.5 w-24" />
                <span className="skeleton h-8 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <ol className="flex flex-col gap-2.5 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-3 transition-colors ${i < step ? "text-dim" : i === step ? "text-fg" : "text-dim/50"}`}>
            <span className="inline-flex size-5 items-center justify-center">
              {i < step ? (
                <IconCheck className="size-4 text-gain" />
              ) : i === step ? (
                <span className="size-2 animate-pulse rounded-full bg-lilac" />
              ) : (
                <span className="size-1.5 rounded-full bg-line" />
              )}
            </span>
            {s}
            {i === step && "…"}
          </li>
        ))}
      </ol>
    </div>
  );
}

const code = "rounded-md border border-line bg-raise px-1.5 py-0.5 font-mono text-[13px] text-fg";

function ErrorPanel({ error, onDemo }: { error: ScanError; onDemo: () => void }) {
  const link = "font-medium text-lilac underline-offset-4 hover:underline";
  return (
    <div className="surface flex flex-col items-start gap-5 p-6" role="alert">
      <div className="flex items-start gap-3.5">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-loss/15 text-loss">
          <IconAlert />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-display text-lg font-semibold">Couldn't scan</p>
          <p className="text-dim">{error.error}</p>
        </div>
      </div>
      {error.code === "no_key" && (
        <ol className="flex flex-col gap-3 text-sm">
          {[
            <>
              Grab a free key, no card needed: Solana at{" "}
              <a href="https://dashboard.helius.dev" target="_blank" rel="noreferrer" className={link}>
                dashboard.helius.dev
              </a>{" "}
              (Free plan) and EVM at{" "}
              <a href="https://etherscan.io/apidashboard" target="_blank" rel="noreferrer" className={link}>
                etherscan.io/apidashboard
              </a>{" "}
              (Free plan).
            </>,
            ...(error.hosted
              ? [
                  <>
                    In Vercel, open the project's <span className="text-fg">Settings → Environment Variables</span> and add{" "}
                    <code className={code}>HELIUS_API_KEY</code> and <code className={code}>ETHERSCAN_API_KEY</code> for Production.
                  </>,
                  <>
                    Go to <span className="text-fg">Deployments</span> and click <span className="text-fg">Redeploy</span> on the latest one. Keys only
                    load on a new deploy.
                  </>,
                ]
              : [
                  <>
                    In the project folder, create a <code className={code}>.env.local</code> file with <code className={code}>HELIUS_API_KEY=your_key</code> and{" "}
                    <code className={code}>ETHERSCAN_API_KEY=your_key</code>. One is enough if you only read one of the networks.
                  </>,
                  <>
                    Stop the server (Ctrl+C) and run <code className={code}>npm run dev</code> again.
                  </>,
                ]),
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-raise text-xs font-semibold text-dim">{i + 1}</span>
              <span className="pt-0.5 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      )}
      <button type="button" onClick={onDemo} className="btn btn-ghost h-10 px-4 text-sm">
        See an example meanwhile
      </button>
    </div>
  );
}

function ReportView({
  report,
  target,
  setTarget,
  connected,
}: {
  report: Report;
  target: string | null;
  setTarget: (t: string | null) => void;
  connected?: string;
}) {
  const { totals, tokens } = report;
  const worst = tokens.find((t) => (t.missedUsd ?? 0) > 0);
  const missedCount = tokens.filter((t) => (t.missedUsd ?? 0) > 0).length;
  const goodSells = tokens.filter((t) => (t.missedUsd ?? 0) < 0).length;
  const totalPain = totals.missedUsd + totals.realizedLossUsd;

  return (
    <div className="fade flex flex-col gap-10">
      <div className="flex flex-wrap gap-2">
        {[
          report.demo ? "Example wallet" : short(report.wallet),
          report.chains.map((c) => CHAINS[c].name).join(", "),
          report.oldestSwapAt ? `${report.swapCount} swaps read, back to ${date(report.oldestSwapAt)}` : `${report.swapCount} swaps read`,
          "Today's price: DexScreener",
        ].map((t) => (
          <span key={t} className="pill">
            {t}
          </span>
        ))}
      </div>

      {(report.demo || report.truncated || report.failedChains.length > 0 || (report.paidChains?.length ?? 0) > 0 || totals.unpriced > 0 || (report.unpricedSwaps ?? 0) > 0) && (
        <ul className="flex flex-col gap-2 text-sm text-dim">
          {report.demo && <Note>Example with made-up data. Scan a real wallet to see your own numbers.</Note>}
          {report.truncated && (
            <Note>
              Very active wallet: {report.completeSince ? `every swap since ${date(report.completeSince)} was read` : "only the most recent swaps were read"} before
              the time limit. Older swaps aren&apos;t counted.
            </Note>
          )}
          {(report.paidChains?.length ?? 0) > 0 && (
            <Note>
              Skipped {report.paidChains!.map((c) => CHAINS[c].name).join(", ")}: the free Etherscan plan doesn&apos;t cover{" "}
              {report.paidChains!.length === 1 ? "it" : "them"}. A free ALCHEMY_API_KEY reads {report.paidChains!.length === 1 ? "it" : "them"}.
            </Note>
          )}
          {report.failedChains.length > 0 && (
            <Note>
              Couldn&apos;t read: {report.failedChains.map((c) => CHAINS[c].name).join(", ")}. {report.failedReasons?.join(" ")}
            </Note>
          )}
          {totals.unpriced > 0 && <Note>{totals.unpriced} token(s) with no price today (probably dead) were left out of the math.</Note>}
          {(report.unpricedSwaps ?? 0) > 0 && (
            <Note>
              {report.unpricedSwaps} token-for-token swap(s) were left out: with no SOL, ETH or stablecoin involved, there's no way to know the
              dollar value at the time.
            </Note>
          )}
        </ul>
      )}

      {tokens.length === 0 ? (
        <div className="surface flex flex-col items-start gap-3 p-8">
          <span className="pill text-gain">
            <IconCheck className="size-3" />
            Diamond hands
          </span>
          <p className="font-display text-2xl font-semibold">No sells found.</p>
          <p className="text-dim">This wallet never sold a token on the networks we read.</p>
        </div>
      ) : (
        <>
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="surface-glow flex flex-col items-start justify-center gap-5 p-6 sm:p-8">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-loss">
                <IconFlame />
                Total loss porn
              </span>
              <p className="whitespace-nowrap font-sans text-[clamp(2.75rem,8vw,5rem)] font-semibold leading-none tracking-[-0.04em]">
                <CountUp value={totalPain} format="money" />
              </p>
              <p className="max-w-[48ch] leading-relaxed text-dim">
                Everything you left on the table selling early, plus what you lost buying high and selling low.
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                {totalPain > 0 && (
                  <PostButton onClick={() => setTarget("total")} active={target === "total"}>
                    Post the total
                  </PostButton>
                )}
                {totals.missedUsd > 0 && totals.realizedLossUsd > 0 && (
                  <SmallPost onClick={() => setTarget("wallet")} active={target === "wallet"}>
                    Post only what I left on the table
                  </SmallPost>
                )}
              </div>
            </div>
            <dl className="grid content-start gap-5">
              <div className="surface flex flex-col gap-2 p-5">
                <dt className="label">Left on the table</dt>
                <dd className="font-sans text-4xl font-semibold leading-none tracking-[-0.03em] text-loss">
                  <CountUp value={totals.missedUsd} format="money" />
                </dd>
                <p className="text-sm leading-relaxed text-dim">
                  What {missedCount} token{missedCount === 1 ? "" : "s"} you sold would be worth today, minus what you got for them.
                </p>
              </div>
              <div className="surface flex flex-col gap-2 p-5">
                <dt className="label">Realized loss</dt>
                <dd className="font-sans text-4xl font-semibold leading-none tracking-[-0.03em] text-loss">
                  <CountUp value={totals.realizedLossUsd} />
                </dd>
                <p className="text-sm leading-relaxed text-dim">What you paid above what you got back, on the tokens you bought and sold.</p>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div className="surface flex flex-col gap-2 p-5">
                  <dt className="label">Tokens sold</dt>
                  <dd className="font-sans text-3xl font-semibold leading-none">{tokens.length}</dd>
                </div>
                <div className="surface flex flex-col gap-2 p-5">
                  <dt className="label">Sold well</dt>
                  <dd className="flex items-center gap-2 font-sans text-3xl font-semibold leading-none">
                    {goodSells}
                    {goodSells > 0 && <IconCheck className="size-5 text-gain" />}
                  </dd>
                </div>
              </div>
            </dl>
          </section>

          {target && <Composer report={report} target={target} connected={connected} onCancel={() => setTarget(null)} />}

          {worst && worst.multiple && worst.priceNow !== null && (
            <section className="surface grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="flex flex-col items-start gap-5">
                <span className="pill">Worst sell</span>
                <div className="flex items-center gap-3">
                  <TokenAvatar symbol={worst.symbol} logo={worst.logo} size={48} />
                  <div className="flex flex-col leading-tight">
                    <span className="font-display text-2xl font-semibold">${worst.symbol}</span>
                    <span className="text-sm text-dim">
                      {CHAINS[worst.chain].name} · last sell on {date(worst.lastSellAt)}
                    </span>
                  </div>
                </div>
                <p className="max-w-[30ch] font-display text-[clamp(1.4rem,2.8vw,1.9rem)] font-medium leading-snug">
                  Sold {amount(worst.soldAmount)} for {money(worst.soldUsd)}. Worth{" "}
                  <span className="text-loss">{money(worst.valueNowUsd!)}</span> today.
                </p>
                <PostButton onClick={() => setTarget(`missed:${worst.key}`)} active={target === `missed:${worst.key}`}>
                  Post this fumble
                </PostButton>
              </div>
              <div className="flex flex-col gap-4 rounded-2xl bg-raise/70 p-5 [--chart-surface:#1f1d27]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-dim">Token price</span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-loss">
                    <IconTrendUp />
                    {multiple(worst.multiple)} since the sell
                  </span>
                </div>
                <CandleChart
                  from={worst.avgSellPrice}
                  to={worst.priceNow}
                  fromLabel="You sold here"
                  toLabel="Today"
                  id="worst"
                  soldUsd={worst.soldUsd}
                  source={{ chain: worst.chain, token: worst.address, pool: worst.pool, since: worst.lastSellAt, demo: report.demo }}
                />
              </div>
            </section>
          )}

          <section className="flex flex-col gap-5">
            <h2 className="font-display text-2xl font-semibold">Token by token</h2>
            <div className="surface overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    {["Token", "Sold for", "Sell price → today", "Worth today", "On the table", "Loss", ""].map((h) => (
                      <th key={h} className={`whitespace-nowrap px-5 py-3.5 text-xs font-medium text-dim ${h && h !== "Token" ? "text-right" : ""}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <Row key={t.key} t={t} target={target} setTarget={setTarget} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <IconInfo className="mt-0.5 size-4 shrink-0 text-lilac" />
      <span>{children}</span>
    </li>
  );
}

function Row({ t, target, setTarget }: { t: TokenStat; target: string | null; setTarget: (t: string) => void }) {
  const chain = CHAINS[t.chain];
  const missed = t.missedUsd;
  return (
    <tr className="border-b border-line transition-colors last:border-b-0 hover:bg-raise/40">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <TokenAvatar symbol={t.symbol} logo={t.logo} size={34} />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="font-semibold">${t.symbol}</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-dim">
              <span className="size-1.5 rounded-full" style={{ background: chain.color }} />
              {chain.name} · {t.sells} sell{t.sells === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5 text-right tabular-nums">{money(t.soldUsd)}</td>
      <td className="whitespace-nowrap px-5 py-3.5 text-right text-dim tabular-nums">
        {price(t.avgSellPrice)} → {t.priceNow === null ? "no price" : price(t.priceNow)}
      </td>
      <td className="px-5 py-3.5 text-right tabular-nums">{t.valueNowUsd === null ? "—" : money(t.valueNowUsd)}</td>
      <td className="px-5 py-3.5 text-right">
        {missed === null ? (
          <span className="text-dim">—</span>
        ) : missed > 0 ? (
          <span className="whitespace-nowrap font-semibold tabular-nums text-loss">{money(missed)}</span>
        ) : (
          <span className="pill whitespace-nowrap py-0.5 text-[11px] text-gain">
            <IconCheck className="size-3" />
            Sold well
          </span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right">
        {t.realizedUsd !== null && t.realizedUsd < 0 ? (
          <span className="whitespace-nowrap font-semibold tabular-nums text-loss">{usd(-t.realizedUsd)}</span>
        ) : (
          <span className="text-dim">—</span>
        )}
      </td>
      <td className="px-5 py-3.5">
        <div className="flex justify-end gap-2">
          {missed !== null && missed > 0 && (
            <SmallPost active={target === `missed:${t.key}`} onClick={() => setTarget(`missed:${t.key}`)}>
              Post missed
            </SmallPost>
          )}
          {t.realizedUsd !== null && t.realizedUsd < 0 && (
            <SmallPost active={target === `realized:${t.key}`} onClick={() => setTarget(`realized:${t.key}`)}>
              Post loss
            </SmallPost>
          )}
        </div>
      </td>
    </tr>
  );
}

function PostButton({ onClick, active, children }: { onClick: () => void; active: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`btn h-11 px-5 text-sm ${active ? "btn-ghost border-lilac/60" : "btn-primary"}`}>
      {children}
      <IconArrow />
    </button>
  );
}

function SmallPost({ onClick, active, children }: { onClick: () => void; active: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`btn h-8 border px-3 text-xs ${active ? "border-lilac/50 bg-lilac/15 text-lilac" : "border-line bg-raise text-fg hover:border-lilac/50"}`}
    >
      {children}
    </button>
  );
}

function Composer({
  report,
  target,
  connected,
  onCancel,
}: {
  report: Report;
  target: string;
  connected?: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const { signMessageAsync } = useSignMessage();
  const sol = useWallet();
  const ref = useRef<HTMLElement>(null);
  const [caption, setCaption] = useState("");
  const [layout, setLayout] = useState<Layout>("tall");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [target]);

  const draft = draftFromReport(report, target);
  if (typeof draft === "string") return null;

  const owner = !report.demo && !!connected && walletKey(connected) === walletKey(report.wallet);
  const cardUrl = `/api/card?wallet=${encodeURIComponent(report.wallet)}&target=${encodeURIComponent(target)}&caption=${encodeURIComponent(caption.trim())}${layout === "wide" ? "&layout=wide" : ""}`;
  // Passa pelo mesmo filtro do post publicado: sem carteira e com os números arredondados
  const preview = toPublic(
    { ...draft, id: "preview", family: report.family, wallet: report.wallet, target, caption: caption.trim(), signature: "", respects: 0, respectedBy: [], createdAt: Date.now() },
    report.demo ? "example" : "",
  );

  async function post() {
    setError("");
    setBusy(true);
    try {
      const body = { wallet: report.wallet, target, caption: caption.trim(), timestamp: Date.now() };
      const message = buildPostMessage(body);
      const signature =
        report.family === "evm"
          ? await signMessageAsync({ message })
          : bs58.encode(await sol.signMessage!(new TextEncoder().encode(message)));
      const res = await fetch("/api/losses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't post. Try again.");
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section ref={ref} className="surface-glow grid scroll-mt-28 items-start gap-8 p-5 sm:p-7 lg:grid-cols-[380px_minmax(0,1fr)]">
      <LossCard preview loss={preview} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-xl font-semibold">Post to the feed</h3>
          <p className="text-sm text-dim">The preview is exactly what will show up.</p>
        </div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="caption" className="label">
            Tell the story (optional)
          </label>
          <span className="text-xs text-dim tabular-nums">{caption.length}/280</span>
        </div>
        <textarea
          id="caption"
          maxLength={280}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Sold it to pay rent. Rent says thanks."
          className="field min-h-28 px-4 py-3 leading-relaxed placeholder:text-dim/60"
        />

        {report.demo ? (
          <p className="flex items-start gap-2 text-sm text-dim">
            <IconInfo className="mt-0.5 size-4 shrink-0 text-lilac" />
            This is just an example, so it can't be posted.
          </p>
        ) : !owner ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-dim">
            <span>Anyone can see the scan, but only the owner can post. Connect {short(report.wallet)} to sign.</span>
            {report.family === "evm" ? <EvmButton /> : <SolButton />}
          </div>
        ) : null}

        {error && (
          <p role="alert" className="rounded-2xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={post} disabled={!owner || busy} className="btn btn-primary h-12 px-6 text-[15px]">
            {busy ? "Waiting for signature…" : "Sign and post"}
          </button>
          <button type="button" onClick={onCancel} className="btn btn-ghost h-12 px-5 text-sm">
            Cancel
          </button>
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="label">Share it without posting</span>
            <div role="radiogroup" aria-label="Format" className="inline-flex rounded-full border border-line bg-raise p-1 text-[13px]">
              {(
                [
                  ["tall", "Vertical"],
                  ["wide", "Horizontal"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={layout === value}
                  onClick={() => setLayout(value)}
                  className={`h-8 rounded-full px-3.5 font-medium transition-colors ${layout === value ? "bg-lilac/20 text-lilac" : "text-dim hover:text-fg"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <VideoMaker loss={preview} demo={!!report.demo} layout={layout}>
            <a href={cardUrl} download className="btn btn-ghost h-12 gap-2 px-5 text-[15px]">
              <IconDownload className="size-4" />
              Download card
            </a>
          </VideoMaker>
        </div>
        <p className="text-xs leading-relaxed text-dim">
          {draft.kind === "missed" ? "The card is a PNG and the video a timelapse of the price since you sold, both made to share anywhere." : "The card is a PNG you can share anywhere, no posting needed."} The signature only proves the wallet is yours. It's not a transaction and costs no gas. The numbers are recomputed on the
          server from the blockchain.
        </p>
      </div>
    </section>
  );
}
