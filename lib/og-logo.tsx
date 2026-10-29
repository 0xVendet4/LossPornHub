/** Logo para imagens do next/og (card, OG): o mesmo quadrado com a seta do cabeçalho do site. */
export function OgLogo({ size, radius }: { size: number; radius: number }) {
  const icon = Math.round(size * 0.58);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: radius,
        background: "linear-gradient(135deg, #b9a7ff, #ff94b8)",
      }}
    >
      <svg viewBox="0 0 24 24" width={icon} height={icon} fill="none" stroke="#17131f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6l6 6 4-4 8 9" />
        <path d="M21 11v6h-6" />
      </svg>
    </div>
  );
}
