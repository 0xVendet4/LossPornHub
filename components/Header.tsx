import Link from "next/link";
import NavLinks from "./NavLinks";
import WalletButtons from "./WalletButtons";

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[10px] bg-gradient-to-br from-lilac to-rose text-[#17131f] shadow-[0_6px_20px_-6px_rgb(185_167_255_/_0.7)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6l6 6 4-4 8 9" />
        <path d="M21 11v6h-6" />
      </svg>
    </span>
  );
}

export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-night/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 md:gap-x-8 px-4 py-3.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="LossPornHub, home">
          <LogoMark />
          <span className="font-display text-lg font-semibold tracking-tight">
            LossPorn<span className="grad-text">Hub</span>
          </span>
        </Link>
        <div className="order-3 w-full md:order-none md:w-auto">
          <NavLinks />
        </div>
        <div className="ml-auto">
          <WalletButtons />
        </div>
      </div>
    </header>
  );
}
