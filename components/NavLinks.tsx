"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Feed" },
  { href: "/scan", label: "Scan" },
  { href: "/leaderboard", label: "Hall of Shame" },
];

export default function NavLinks() {
  const path = usePathname();
  return (
    <nav className="seg flex w-full md:inline-flex md:w-auto [&>*]:flex-1 [&>*]:text-center md:[&>*]:flex-none">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
