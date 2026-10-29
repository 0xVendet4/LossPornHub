import { ImageResponse } from "next/og";
import { demoReport } from "@/lib/scan/demo";
import { money } from "@/lib/format";
import { OgLogo } from "@/lib/og-logo";

export const alt = "LossPornHub: how much would you have if you hadn't sold?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Prévia do site quando alguém compartilha a home. Usa o raio-x de exemplo como ilustração. */
export default function Image() {
  const report = demoReport();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 72,
          background: "linear-gradient(160deg, #1a1626 0%, #0e0d12 55%, #1c1119 100%)",
          color: "#f4f2f8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <OgLogo size={44} radius={14} />
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>
              LossPorn<span style={{ color: "#d9b3e0" }}>Hub</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 620 }}>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>How much would you have if you hadn't sold?</div>
            <div style={{ display: "flex", fontSize: 26, color: "#9b97a9" }}>On-chain wallet scan for EVM and Solana</div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            width: 340,
            padding: 28,
            borderRadius: 28,
            background: "#17161d",
            border: "1px solid #3a3450",
            alignSelf: "center",
          }}
        >
          <div style={{ display: "flex", fontSize: 18, color: "#9b97a9" }}>Left on the table by selling early</div>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 700, letterSpacing: -2 }}>{money(report.totals.missedUsd)}</div>
          <div style={{ display: "flex", fontSize: 18, color: "#ff6d74" }}>4 tokens went up after the sell</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {report.tokens.slice(0, 3).map((t) => (
              <div key={t.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 20 }}>
                <span style={{ fontWeight: 600 }}>${t.symbol}</span>
                <span style={{ color: "#ff6d74", fontWeight: 600 }}>{money(t.missedUsd ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
