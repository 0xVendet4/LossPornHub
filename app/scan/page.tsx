import Scanner from "@/components/Scanner";

export const metadata = { title: "Wallet scan · LossPornHub" };

export default function ScanPage() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col items-start gap-5">
        <span className="pill">Reads your swaps on EVM and Solana</span>
        <h1 className="font-display text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[1.04]">
          Wallet <span className="grad-text">scan</span>
        </h1>
        <p className="max-w-[54ch] text-lg leading-relaxed text-dim">
          We take everything you sold and compare it with today's price: how much you'd have if you'd held, and how much you
          actually lost buying high and selling low.
        </p>
      </div>
      <Scanner />
    </div>
  );
}
