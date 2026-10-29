export type ChainKey =
  | "ethereum"
  | "base"
  | "arbitrum"
  | "optimism"
  | "polygon"
  | "bsc"
  | "solana";

export type ChainInfo = {
  key: ChainKey;
  name: string;
  family: "evm" | "solana";
  color: string;
  txUrl: (hash: string) => string;
  addressUrl: (addr: string) => string;
};

const evm = (key: ChainKey, name: string, color: string, explorer: string): ChainInfo => ({
  key,
  name,
  family: "evm",
  color,
  txUrl: (h) => `${explorer}/tx/${h}`,
  addressUrl: (a) => `${explorer}/address/${a}`,
});

export const CHAINS: Record<ChainKey, ChainInfo> = {
  ethereum: evm("ethereum", "Ethereum", "#627eea", "https://etherscan.io"),
  base: evm("base", "Base", "#0052ff", "https://basescan.org"),
  arbitrum: evm("arbitrum", "Arbitrum", "#28a0f0", "https://arbiscan.io"),
  optimism: evm("optimism", "Optimism", "#ff0420", "https://optimistic.etherscan.io"),
  polygon: evm("polygon", "Polygon", "#8247e5", "https://polygonscan.com"),
  bsc: evm("bsc", "BNB Chain", "#f0b90b", "https://bscscan.com"),
  solana: {
    key: "solana",
    name: "Solana",
    family: "solana",
    color: "#14f195",
    txUrl: (h) => `https://solscan.io/tx/${h}`,
    addressUrl: (a) => `https://solscan.io/account/${a}`,
  },
};

export const CHAIN_LIST = Object.values(CHAINS);

export type Family = "evm" | "solana";

export const EVM_CHAINS = CHAIN_LIST.filter((c) => c.family === "evm").map((c) => c.key);

/** Identifica se o endereço é EVM (0x…) ou Solana (base58, 32 bytes). */
export function detectFamily(address: string): Family | null {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return "evm";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "solana";
  return null;
}

/** Chave canônica de carteira: EVM não diferencia maiúsculas. */
export const walletKey = (address: string) => (address.startsWith("0x") ? address.toLowerCase() : address);

export const isChainKey = (v: unknown): v is ChainKey =>
  typeof v === "string" && v in CHAINS;
