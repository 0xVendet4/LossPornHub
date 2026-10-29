import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LossCard from "@/components/LossCard";
import DeletePost from "@/components/DeletePost";
import { IconArrow } from "@/components/Icons";
import { getLoss } from "@/lib/store";
import { headline } from "@/lib/headline";
import { authorName } from "@/lib/privacy";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const loss = await getLoss(id);
  // O layout já acrescenta " · LossPornHub" ao título da aba; o do compartilhamento leva o nome junto
  if (!loss) return { title: "Post not found" };
  const title = `${headline(loss)} · LossPornHub`;
  const description =
    loss.kind === "realized"
      ? "Bought high, sold low. On-chain wallet scan, signed by the owner."
      : loss.kind === "total"
        ? "Everything left on the table plus every realized loss. On-chain wallet scan, signed by the owner."
        : "Sold early and the token went up. On-chain wallet scan, signed by the owner.";
  return { title: headline(loss), description, openGraph: { title, description } };
}

export default async function PostPage({ params }: Props) {
  const { id } = await params;
  const loss = await getLoss(id);
  if (!loss) notFound();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8">
      <div className="flex flex-col gap-2 text-center">
        <span className="text-sm text-dim">Wallet scan, posted by {authorName(loss.author)}</span>
        <h1 className="font-display text-2xl font-semibold">{headline(loss)}</h1>
      </div>

      <LossCard loss={loss} />
      {!loss.example && <DeletePost id={loss.id} family={loss.family} />}

      <div className="surface flex flex-col items-center gap-3 p-6 text-center">
        <p className="font-display text-lg font-semibold">What about your wallet?</p>
        <p className="text-sm text-dim">Paste the address and find out what you left on the table.</p>
        <Link href="/scan" className="btn btn-primary mt-1 h-11 px-5 text-sm">
          Scan my wallet
          <IconArrow />
        </Link>
      </div>
    </div>
  );
}
