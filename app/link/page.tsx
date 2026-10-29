import LinkWallets from "@/components/LinkWallets";

export const metadata = {
  title: "Link wallets · LossPornHub",
  description: "Put posts from all your wallets under one anonymous name. Addresses stay private.",
};

export default function LinkPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <div className="flex flex-col items-start gap-5">
        <span className="pill">One profile, many wallets</span>
        <h1 className="font-display text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.06]">
          Link your <span className="grad-text">wallets</span>
        </h1>
        <p className="max-w-[56ch] text-lg leading-relaxed text-dim">
          Fumbled on more than one wallet? Sign with each and their posts show under one anonymous name, with the totals added up in the Hall of
          Shame. Nobody sees the addresses or which posts came from which wallet.
        </p>
      </div>
      <LinkWallets />
    </div>
  );
}
