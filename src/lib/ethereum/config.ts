/**
 * Vigil.OS — Ethereum / Wagmi / Alchemy configuration
 *
 * Reads from VITE_ environment variables. All values must be set in .env:
 *   VITE_ALCHEMY_RPC_URL  — full Alchemy RPC URL for Sepolia
 *   VITE_ALCHEMY_API_KEY  — Alchemy API key
 *   VITE_ETH_NETWORK      — "sepolia" | "mainnet"
 *   VITE_CHAIN_ID         — 11155111 (Sepolia) | 1 (mainnet)
 *   VITE_CONTRACT_ADDRESS — deployed DocumentNotary contract address
 */

import { http, createConfig } from "wagmi";
import { sepolia, mainnet } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

// ─── Env helpers ──────────────────────────────────────────────

export const ALCHEMY_RPC_URL: string =
  (import.meta.env["VITE_ALCHEMY_RPC_URL"] as string | undefined) ?? "";

export const ALCHEMY_API_KEY: string =
  (import.meta.env["VITE_ALCHEMY_API_KEY"] as string | undefined) ?? "";

export const ETH_NETWORK: "sepolia" | "mainnet" =
  ((import.meta.env["VITE_ETH_NETWORK"] as string | undefined) as "sepolia" | "mainnet" | undefined) ?? "sepolia";

export const CHAIN_ID: number =
  Number((import.meta.env["VITE_CHAIN_ID"] as string | undefined) ?? 11155111);

export const CONTRACT_ADDRESS: `0x${string}` =
  ((import.meta.env["VITE_CONTRACT_ADDRESS"] as string | undefined) ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const isConfigured: boolean = Boolean(
  (import.meta.env["VITE_ALCHEMY_RPC_URL"] as string | undefined) &&
  (import.meta.env["VITE_CONTRACT_ADDRESS"] as string | undefined) &&
  (import.meta.env["VITE_CONTRACT_ADDRESS"] as string | undefined) !== "0x0000000000000000000000000000000000000000"
);

// ─── Active chain ─────────────────────────────────────────────

export const activeChain = ETH_NETWORK === "mainnet" ? mainnet : sepolia;

export const ETHERSCAN_BASE =
  ETH_NETWORK === "mainnet"
    ? "https://etherscan.io"
    : "https://sepolia.etherscan.io";

export function etherscanTx(txHash: string) {
  return `${ETHERSCAN_BASE}/tx/${txHash}`;
}

export function etherscanAddress(addr: string) {
  return `${ETHERSCAN_BASE}/address/${addr}`;
}

// ─── Wagmi config ─────────────────────────────────────────────

// Always provide transports for both chains to satisfy wagmi's type constraints
const sepoliaTransport = { [sepolia.id]: ALCHEMY_RPC_URL ? http(ALCHEMY_RPC_URL) : http() };
const mainnetTransport = { [mainnet.id]: ALCHEMY_RPC_URL ? http(ALCHEMY_RPC_URL) : http() };
const chainTransports = ETH_NETWORK === "mainnet"
  ? { ...sepoliaTransport, ...mainnetTransport }
  : { ...mainnetTransport, ...sepoliaTransport };

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [
    metaMask(),
    injected(),
  ],
  transports: chainTransports,
});
