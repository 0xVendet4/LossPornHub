import Link from "next/link";
import { IconArrow } from "@/components/Icons";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-16 text-center">
      <span className="font-sans text-[5rem] font-semibold leading-none tracking-[-0.04em] text-loss">−404</span>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold">This page got liquidated.</h1>
        <p className="text-dim">The link doesn't exist or the post went to the graveyard.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-primary h-11 px-5 text-sm">
          Back to the feed
          <IconArrow />
        </Link>
        <Link href="/scan" className="btn btn-ghost h-11 px-5 text-sm">
          Scan my wallet
        </Link>
      </div>
    </div>
  );
}
