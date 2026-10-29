import type { MetadataRoute } from "next";

/** Deixa o site instalável no celular e pinta a barra do navegador com o fundo do site. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LossPornHub",
    short_name: "LossPornHub",
    description: "How much would you have if you hadn't sold? On-chain wallet scan for EVM and Solana.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e0d12",
    theme_color: "#0e0d12",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
