"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { short } from "@/lib/format";

const base = "btn btn-ghost h-9 gap-1.5 px-3 max-[419px]:[header_&]:px-2 text-[13px] sm:h-10 sm:gap-2 sm:px-3.5 sm:text-sm";

export function Badge({ kind }: { kind: "evm" | "sol" }) {
  return (
    <span
      className={`inline-flex size-5 items-center justify-center rounded-full text-[9px] font-bold text-[#17131f] ${
        kind === "evm" ? "bg-[#8ea2ff]" : "bg-gradient-to-br from-[#9945ff] to-[#14f195]"
      }`}
      aria-hidden
    >
      {kind === "evm" ? "Ξ" : "◎"}
    </span>
  );
}

// Em telas bem estreitas o botão mostra só o ícone, para caber na mesma linha do logo
const Label = ({ children }: { children: React.ReactNode }) => <span className="max-[419px]:[header_&]:sr-only">{children}</span>;

const Dot = () => <span className="live-dot size-1.5 rounded-full bg-gain" />;

export function EvmButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openConnectModal, openAccountModal, openChainModal }) => {
        if (!mounted || !account || !chain)
          return (
            <button type="button" onClick={openConnectModal} className={base} style={mounted ? undefined : { opacity: 0 }}>
              <Badge kind="evm" />
              <Label>EVM</Label>
            </button>
          );
        if (chain.unsupported)
          return (
            <button type="button" onClick={openChainModal} className={`${base} text-loss`}>
              <Badge kind="evm" />
              Switch network
            </button>
          );
        return (
          <button type="button" onClick={openAccountModal} className={base}>
            <Badge kind="evm" />
            <Dot />
            <Label>{account.displayName}</Label>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

export function SolButton() {
  const { publicKey, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !publicKey)
    return (
      <button type="button" onClick={() => setVisible(true)} className={base}>
        <Badge kind="sol" />
        <Label>{connecting ? "Connecting…" : "Solana"}</Label>
      </button>
    );

  return (
    <button type="button" onClick={() => disconnect()} className={`group ${base}`} title="Disconnect Solana wallet">
      <Badge kind="sol" />
      <Dot />
      <Label>
        <span className="group-hover:hidden">{short(publicKey.toBase58())}</span>
        <span className="hidden group-hover:inline">Disconnect</span>
      </Label>
    </button>
  );
}

export default function WalletButtons() {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-dim lg:inline">Connect</span>
      <EvmButton />
      <SolButton />
    </div>
  );
}
