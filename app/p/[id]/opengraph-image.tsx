import { ImageResponse } from "next/og";
import { getLoss } from "@/lib/store";
import { multiple, painUsd } from "@/lib/format";

export const alt = "Wallet scan on LossPornHub";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const KIND = { missed: "Left on the table", realized: "Realized loss", wallet: "Whole wallet on the table" };

/** Imagem de prévia do post para X, Telegram, WhatsApp etc. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loss = await getLoss(id);
  const sym = loss ? (loss.kind === "wallet" ? `${loss.tokensCount} tokens` : `$${loss.token.toUpperCase()}`) : "";
  const detail = !loss
    ? ""
    : loss.kind === "missed" && loss.multiple
      ? `Went up ${multiple(loss.multiple)} after the sell`
      : loss.kind === "wallet"
        ? `The worst was $${loss.token.toUpperCase()}`
        : "Bought high, sold low";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(160deg, #1a1626 0%, #0e0d12 55%, #1c1119 100%)",
          color: "#f4f2f8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "linear-gradient(135deg, #b9a7ff, #ff94b8)",
            }}
          />
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>
            LossPorn<span style={{ color: "#d9b3e0" }}>Hub</span>
          </div>
        </div>

        {loss ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", fontSize: 30, color: "#ff6d74", fontWeight: 600 }}>{KIND[loss.kind]}</div>
            <div style={{ display: "flex", fontSize: 150, fontWeight: 700, letterSpacing: -6, lineHeight: 1 }}>{painUsd(loss.kind, loss.amountUsd)}</div>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 600 }}>{sym}</div>
            <div style={{ display: "flex", fontSize: 28, color: "#9b97a9" }}>{detail}</div>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>How much would you have if you hadn't sold?</div>
        )}

        <div style={{ display: "flex", fontSize: 24, color: "#9b97a9" }}>On-chain wallet scan for EVM and Solana</div>
      </div>
    ),
    { ...size },
  );
}
