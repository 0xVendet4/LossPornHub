import type { Metadata, Viewport } from "next";
import { Figtree, Geist_Mono, Sora } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Link from "next/link";
import Header, { LogoMark } from "@/components/Header";
import Ticker from "@/components/Ticker";
import BackToTop from "@/components/BackToTop";

const sora = Sora({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-sora" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: "#0e0d12" };

export const metadata: Metadata = {
  title: { default: "LossPornHub", template: "%s · LossPornHub" },
  twitter: { card: "summary_large_image" },
  description: "How much would you have if you hadn't sold? On-chain loss porn for EVM and Solana.",
  openGraph: {
    siteName: "LossPornHub",
    locale: "en_US",
    type: "website",
    title: "LossPornHub",
    description: "How much would you have if you hadn't sold? On-chain wallet scan for EVM and Solana.",
  },
};

const FOOTER = [
  {
    title: "Browse",
    links: [
      ["Feed", "/"],
      ["Wallet scan", "/scan"],
      ["Hall of Shame", "/leaderboard"],
      ["Link your wallets", "/link"],
      ["How the math works", "/about"],
    ],
  },
  {
    title: "Where the numbers come from",
    links: [
      ["Solana swaps via Helius", "https://helius.dev"],
      ["EVM swaps via Etherscan", "https://etherscan.io"],
      ["Today's price via DexScreener", "https://dexscreener.com"],
    ],
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`overflow-x-clip ${sora.variable} ${figtree.variable} ${geistMono.variable}`}>
      <body className="min-h-screen overflow-x-clip antialiased">
        <Providers>
          <Header />
          <Ticker />
          <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">{children}</main>
          <footer className="border-t border-line">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
              <div className="flex flex-col items-start gap-3">
                <Link href="/" className="flex items-center gap-2.5" aria-label="LossPornHub, home">
                  <LogoMark size={28} />
                  <span className="font-display font-semibold tracking-tight">
                    LossPorn<span className="grad-text">Hub</span>
                  </span>
                </Link>
                <p className="max-w-[34ch] text-sm leading-relaxed text-dim">
                  How much you'd have if you hadn't sold. On-chain wallet scan for EVM and Solana, signed by the owner.
                </p>
                <p className="text-xs text-dim">Not financial advice. Obviously.</p>
              </div>
              {FOOTER.map((col) => (
                <div key={col.title} className="flex flex-col gap-3">
                  <span className="text-xs font-medium uppercase tracking-[0.08em] text-dim">{col.title}</span>
                  <ul className="flex flex-col gap-2 text-sm">
                    {col.links.map(([label, href]) => (
                      <li key={href}>
                        {href.startsWith("/") ? (
                          <Link href={href} className="text-dim transition-colors hover:text-fg">
                            {label}
                          </Link>
                        ) : (
                          <a href={href} target="_blank" rel="noreferrer" className="text-dim transition-colors hover:text-fg">
                            {label}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </footer>
          <BackToTop />
        </Providers>
      </body>
    </html>
  );
}
