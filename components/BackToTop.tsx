"use client";

import { useEffect, useState } from "react";
import { IconArrowUp } from "./Icons";

/** Botão flutuante de voltar ao topo, que aparece depois de rolar mais de uma tela. */
export default function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function top() {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      onClick={top}
      aria-label="Back to top"
      title="Back to top"
      tabIndex={show ? 0 : -1}
      className={`fixed bottom-5 right-5 z-40 inline-flex size-12 items-center justify-center rounded-full border border-line bg-card/85 text-fg shadow-[0_10px_30px_-10px_rgb(0_0_0_/_0.7)] backdrop-blur transition-all duration-200 hover:border-lilac/60 hover:text-lilac sm:bottom-8 sm:right-8 ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <IconArrowUp className="size-5" />
    </button>
  );
}
