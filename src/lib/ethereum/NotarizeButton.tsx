/**
 * Vigil.OS — NotarizeButton
 * One-click "Notarize on Ethereum" button for the document detail page.
 * Shows live status: idle → wallet popup → broadcasting → confirmed
 */

import { useAccount } from "wagmi";
import { Link2, Loader2, CheckCircle2, ExternalLink, AlertCircle, Wallet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNotarize } from "./useNotarize";
import { useVerifyOnChain } from "./useVerifyOnChain";
import { WalletButton } from "./WalletButton";
import { etherscanTx, isConfigured } from "./config";

interface NotarizeButtonProps {
  sha256Hash: string;
  documentId: string;
  documentName: string;
  className?: string;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "Notarize on Ethereum",
  "waiting-wallet": "Confirm in MetaMask…",
  broadcasting: "Broadcasting tx…",
  confirmed: "Notarized on Ethereum",
  error: "Notarize on Ethereum",
};

export function NotarizeButton({
  sha256Hash,
  documentId,
  documentName,
  className,
}: NotarizeButtonProps) {
  const { isConnected } = useAccount();
  const { notarize, status, result, error, isLoading } = useNotarize();
  const { isNotarized, result: onChainResult } = useVerifyOnChain(sha256Hash);

  if (!isConfigured) {
    return (
      <div className={cn("rounded-sm border border-dashed border-border p-4 text-center", className)}>
        <p className="text-xs text-muted-foreground">
          Ethereum not configured.{" "}
          <span className="font-mono">VITE_ALCHEMY_RPC_URL</span> and{" "}
          <span className="font-mono">VITE_CONTRACT_ADDRESS</span> must be set in <span className="font-mono">.env</span>.
        </p>
      </div>
    );
  }

  async function handleNotarize() {
    const txHash = await notarize({ sha256Hash, documentId, documentName });
    if (txHash) {
      toast.success("Transaction submitted!", {
        description: `Tx: ${txHash.slice(0, 18)}…`,
        action: {
          label: "View on Etherscan",
          onClick: () => window.open(etherscanTx(txHash), "_blank"),
        },
      });
    }
  }

  // Already notarized — show proof
  if (isNotarized && onChainResult) {
    const ts = new Date(onChainResult.timestamp * 1000).toLocaleString();
    return (
      <div className={cn("rounded-sm border border-green-500/30 bg-green-500/10 p-4", className)}>
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-400" />
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[11px] font-bold text-green-400 uppercase tracking-wider">
              ✅ On-Chain — Ethereum Verified
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground space-y-0.5">
              <div>Notarized by: <span className="text-foreground font-mono">{onChainResult.notarizedBy.slice(0, 10)}…</span></div>
              <div>Timestamp: <span className="text-foreground">{ts}</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Confirmed in this session
  if (status === "confirmed" && result) {
    return (
      <div className={cn("rounded-sm border border-green-500/30 bg-green-500/10 p-4", className)}>
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-400" />
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[11px] font-bold text-green-400 uppercase tracking-wider">
              Confirmed — Block #{result.blockNumber}
            </div>
            <a
              href={etherscanTx(result.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
            >
              <ExternalLink className="size-2.5" />
              View on Etherscan
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Wallet connection */}
      {!isConnected && (
        <div className="rounded-sm border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="mb-2 text-[10px] text-amber-400/80">Connect your MetaMask wallet to notarize this document on Ethereum.</p>
          <WalletButton />
        </div>
      )}

      {isConnected && (
        <div className="flex items-center justify-between">
          <WalletButton />
        </div>
      )}

      {/* Notarize button */}
      <button
        id={`notarize-btn-${documentId}`}
        onClick={() => void handleNotarize()}
        disabled={isLoading || !isConnected}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-sm border px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
          isLoading
            ? "border-primary/30 bg-primary/10 text-primary/70"
            : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {isLoading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Link2 className="size-3.5" />
        )}
        {STATUS_LABEL[status]}
      </button>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-1.5 rounded-sm border border-destructive/30 bg-destructive/10 p-2.5 text-[10px] text-destructive">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Status hint */}
      {status === "waiting-wallet" && (
        <p className="text-center text-[10px] text-muted-foreground">
          👆 Check MetaMask popup to confirm the transaction
        </p>
      )}
      {status === "broadcasting" && (
        <p className="text-center text-[10px] text-muted-foreground">
          ⏳ Waiting for Sepolia block confirmation (~12 seconds)…
        </p>
      )}
    </div>
  );
}
