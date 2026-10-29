"use client";

import Link from "next/link";
import { IconAlert } from "@/components/Icons";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-16 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-loss/15 text-loss">
        <IconAlert className="size-7" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold">Something broke on our end.</h1>
        <p className="text-dim">Not you. Try again, and if it keeps happening, head back to the feed.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primary h-11 px-5 text-sm">
          Try again
        </button>
        <Link href="/" className="btn btn-ghost h-11 px-5 text-sm">
          Back to the feed
        </Link>
      </div>
    </div>
  );
}
