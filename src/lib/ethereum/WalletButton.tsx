/**
 * Vigil.OS — WalletButton
 * MetaMask connect / disconnect button with wallet state display.
 * Uses wagmi hooks — must be inside <WagmiProvider>.
 */

import { useAccount, useConnect, useDisconnect, useBalance } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { Wallet, LogOut, ExternalLink, Loader2, AlertCircle } from "lucide-react";
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

export function WalletButton({ className }: { className?: string }) {
  const { address, isConnected, isConnecting } = useAccount();
  const { connect, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();

  const { data: balance } = useBalance({
    address,
    query: { enabled: isConnected && Boolean(address) },
  });

  if (isConnecting) {
    return (
      <div className={cn("flex items-center gap-2 rounded-sm border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="size-3.5 animate-spin" />
        <span className="font-mono">Connecting...</span>
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <button
          id="metamask-connect-btn"
          onClick={() => connect({ connector: metaMask() })}
          className="flex items-center gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
        >
          <Wallet className="size-3.5" />
          Connect MetaMask
        </button>
        {connectError && (
          <div className="flex items-center gap-1.5 text-[10px] text-destructive">
            <AlertCircle className="size-3" />
            {connectError.message.includes("rejected")
              ? "Connection rejected"
              : connectError.message.slice(0, 60)}
          </div>
        )}
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
