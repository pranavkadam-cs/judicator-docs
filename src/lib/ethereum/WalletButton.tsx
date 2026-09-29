/**
 * Vigil.OS — WalletButton
 * MetaMask connect / disconnect button with wallet state display.
 * Uses wagmi hooks — must be inside <WagmiProvider>.
 */

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect, useBalance } from "wagmi";
import { Wallet, LogOut, ExternalLink, Loader2, AlertCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { etherscanAddress, activeChain } from "./config";

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatEth(value: bigint, decimals: number = 18): string {
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 4);
  return `${whole}.${fractionStr}`;
}

function getEthereumProvider() {
  if (typeof window === "undefined") return null;
  const anyWindow = window as any;
  if (!anyWindow.ethereum) return null;
  // If multiple injected providers exist (e.g. MetaMask + Coinbase or Phantom)
  if (Array.isArray(anyWindow.ethereum.providers)) {
    const mm = anyWindow.ethereum.providers.find((p: any) => p.isMetaMask);
    if (mm) return mm;
  }
  return anyWindow.ethereum;
}

export function WalletButton({ className }: { className?: string }) {
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();

  const [hasProvider, setHasProvider] = useState<boolean | null>(null);

  useEffect(() => {
    setHasProvider(Boolean(getEthereumProvider()));
  }, []);

  const { data: balance } = useBalance({
    address,
    query: { enabled: isConnected && Boolean(address) },
  });

  async function handleConnect() {
    const provider = getEthereumProvider();

    if (!provider) {
      toast.error("MetaMask Extension Not Found", {
        description: "Please install the MetaMask browser extension from metamask.io and refresh this page.",
        action: {
          label: "Get MetaMask",
          onClick: () => window.open("https://metamask.io/download/", "_blank"),
        },
        duration: 8000,
      });
      window.open("https://metamask.io/download/", "_blank");
      return;
    }

    try {
      // 1. First request accounts directly from provider to trigger popup
      await provider.request({ method: "eth_requestAccounts" });

      // 2. Connect via wagmi connector
      const targetConnector =
        connectors.find((c) => c.id === "injected") ||
        connectors.find((c) => c.id === "metaMask") ||
        connectors[0];

      if (targetConnector) {
        connect({ connector: targetConnector });
      }
    } catch (err: any) {
      if (err?.code === 4001) {
        toast.warning("Connection cancelled in MetaMask.");
      } else {
        console.warn("Wallet connect error:", err);
        // Fallback to wagmi connect
        const targetConnector =
          connectors.find((c) => c.id === "injected") ||
          connectors.find((c) => c.id === "metaMask") ||
          connectors[0];
        if (targetConnector) {
          connect({ connector: targetConnector });
        }
      }
    }
  }

  if (isConnecting) {
    return (
      <div className={cn("flex items-center gap-2 rounded-sm border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="size-3.5 animate-spin" />
        <span className="font-mono">Connecting...</span>
      </div>
    );
  }

  if (!isConnected || !address) {
    const isProviderMissing = hasProvider === false || connectError?.message?.toLowerCase().includes("provider not found");

    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        {isProviderMissing ? (
          <button
            id="metamask-install-btn"
            onClick={() => window.open("https://metamask.io/download/", "_blank")}
            className="flex items-center gap-2 rounded-sm border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
            title="MetaMask is not detected in this browser. Click to install from metamask.io"
          >
            <Download className="size-3.5" />
            Install MetaMask Extension
          </button>
        ) : (
          <button
            id="metamask-connect-btn"
            onClick={() => void handleConnect()}
            className="flex items-center gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
          >
            <Wallet className="size-3.5" />
            Connect MetaMask
          </button>
        )}

        {isProviderMissing ? (
          <div className="text-[10px] text-amber-400/90 leading-tight">
            ⚠ MetaMask extension not detected. Install it in Chrome/Brave/Edge & reload.
          </div>
        ) : connectError ? (
          <div className="flex items-center gap-1.5 text-[10px] text-destructive">
            <AlertCircle className="size-3" />
            {connectError.message.includes("rejected")
              ? "Connection rejected in wallet"
              : connectError.message.slice(0, 70)}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center gap-2 rounded-sm border border-green-500/30 bg-green-500/10 px-3 py-2">
        <div className="size-1.5 rounded-full bg-green-400 animate-pulse" />
        <div>
          <a
            href={etherscanAddress(address)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-mono text-[11px] font-bold text-green-400 hover:underline"
          >
            {truncateAddress(address)}
            <ExternalLink className="size-2.5" />
          </a>
          {balance && (
            <div className="font-mono text-[9px] text-muted-foreground">
              {formatEth(balance.value, balance.decimals)} {balance.symbol} · {activeChain.name}
            </div>
          )}
        </div>
      </div>
      <button
        id="metamask-disconnect-btn"
        onClick={() => disconnect()}
        title="Disconnect wallet"
        className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-2 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors cursor-pointer"
      >
        <LogOut className="size-3" />
        Disconnect
      </button>
    </div>
  );
}
