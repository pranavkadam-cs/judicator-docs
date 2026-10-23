import { useState } from "react";
import { useAccount } from "wagmi";
import { useServerFn } from "@tanstack/react-start";
import {
  Link2,
  Loader2,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNotarize } from "./useNotarize";
import { useVerifyOnChain } from "./useVerifyOnChain";
import { WalletButton } from "./WalletButton";
import { etherscanTx, etherscanAddress, CONTRACT_ADDRESS, isConfigured } from "./config";
import { notarizeOnSepoliaFn, verifyOnSepoliaFn } from "@/lib/dms.functions";
import { DeployContractButton } from "./DeployContractModal";

interface NotarizeButtonProps {
  sha256Hash: string;
  documentId: string;
  documentName: string;
  className?: string;
  onNotarized?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  idle: "Notarize via MetaMask",
  "waiting-wallet": "Confirm in MetaMask…",
  broadcasting: "Broadcasting to Sepolia…",
  confirmed: "Notarized on Ethereum",
  error: "Retry via MetaMask",
};

export function NotarizeButton({
  sha256Hash,
  documentId,
  documentName,
  className,
  onNotarized,
}: NotarizeButtonProps) {
  const { isConnected } = useAccount();
  const { notarize, status, result, error, isLoading } = useNotarize();
  const { isNotarized, result: onChainResult, refetch, isPending: isVerifying } = useVerifyOnChain(sha256Hash);

  const [relaying, setRelaying] = useState(false);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [serverVerified, setServerVerified] = useState<any | null>(null);

  const serverNotarize = useServerFn(notarizeOnSepoliaFn);
  const serverVerify = useServerFn(verifyOnSepoliaFn);

  if (!isConfigured) {
    return (
      <div className={cn("rounded-sm border border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-center space-y-2", className)}>
        <p className="text-xs text-amber-400 font-bold">
          Smart Contract Not Deployed Yet
        </p>
        <p className="text-[10px] text-muted-foreground">
          Deploy the <span className="font-mono text-foreground">DocumentNotary.sol</span> contract to Sepolia testnet using MetaMask.
        </p>
        <DeployContractButton />
      </div>
    );
  }

  async function handleMetaMaskNotarize() {
    const txHash = await notarize({ sha256Hash, documentId, documentName });
    if (txHash) {
      toast.success("Transaction submitted to Sepolia!", {
        description: `Tx: ${txHash.slice(0, 18)}…`,
        action: {
          label: "View on Etherscan",
          onClick: () => window.open(etherscanTx(txHash), "_blank"),
        },
      });
      setTimeout(() => {
        void refetch();
        onNotarized?.();
      }, 5000);
    }
  }

  async function handleServerRelayedNotarize() {
    setRelaying(true);
    setRelayError(null);
    try {
      const res = await serverNotarize({
        data: {
          sha256Hash,
          documentId,
          documentName,
        },
      });

      if (res.success && res.txHash) {
        toast.success("Anchored to Sepolia Blockchain!", {
          description: `Mined in block #${res.blockNumber} (tx: ${res.txHash.slice(0, 14)}…)`,
          action: {
            label: "View on Etherscan",
            onClick: () => window.open(res.etherscanTxUrl || etherscanTx(res.txHash!), "_blank"),
          },
        });
        await refetch();
        onNotarized?.();
      } else {
        setRelayError(res.error || "Notarization failed");
        toast.error("Sepolia Notarization Failed", { description: res.error });
      }
    } catch (err: any) {
      const msg = err?.message || "Server relayer failed";
      setRelayError(msg);
      toast.error("Notarization failed", { description: msg });
    } finally {
      setRelaying(false);
    }
  }

  async function handleCheckLive() {
    try {
      await refetch();
      const direct = await serverVerify({ data: { sha256Hash } });
      setServerVerified(direct);
      if (direct.exists) {
        toast.success("Verified on Sepolia!", {
          description: `Anchored by ${direct.notarizedBy?.slice(0, 10)}… on ${direct.timestampFormatted || "Sepolia"}`,
        });
      } else {
        toast.info("Document not found on Sepolia yet", {
          description: "Use the notarize buttons below to anchor this SHA-256 hash on-chain.",
        });
      }
    } catch (err: any) {
      toast.error("Live verification error", { description: err?.message });
    }
  }

  const effectiveOnChain = (isNotarized && onChainResult) || (serverVerified?.exists ? serverVerified : null);

  // Already notarized — show proof
  if (effectiveOnChain) {
    const timestampMs = effectiveOnChain.timestamp
      ? (effectiveOnChain.timestamp > 1e11 ? effectiveOnChain.timestamp : effectiveOnChain.timestamp * 1000)
      : Date.now();
    const ts = new Date(timestampMs).toLocaleString();
    const notarizer = effectiveOnChain.notarizedBy || "On-Chain Wallet";

    return (
      <div className={cn("rounded-sm border border-green-500/30 bg-green-500/10 p-4 space-y-3", className)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-400" />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs font-bold text-green-400 uppercase tracking-wider flex items-center gap-2">
                Live On-Chain — Ethereum Sepolia Verified
                <span className="size-2 rounded-full bg-green-400 animate-pulse" />
              </div>
              <div className="mt-1 text-xs text-muted-foreground space-y-1 font-mono">
                <div>
                  <span className="text-muted-foreground">Notarized by:</span>{" "}
                  <a
                    href={etherscanAddress(notarizer)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground hover:text-primary hover:underline"
                  >
                    {notarizer}
                  </a>
                </div>
                <div>
                  <span className="text-muted-foreground">Block Timestamp:</span>{" "}
                  <span className="text-foreground font-sans">{ts}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Document ID:</span>{" "}
                  <span className="text-primary">{effectiveOnChain.documentId || documentId}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Contract:</span>{" "}
                  <a
                    href={etherscanAddress(CONTRACT_ADDRESS)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {CONTRACT_ADDRESS.slice(0, 10)}…{CONTRACT_ADDRESS.slice(-8)}
                    <ExternalLink className="size-2.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={() => void handleCheckLive()}
            className="flex items-center gap-1 rounded-sm border border-green-500/30 bg-green-500/15 px-2 py-1 font-mono text-[9px] font-bold text-green-400 hover:bg-green-500/25 cursor-pointer uppercase"
            title="Re-query Sepolia smart contract"
          >
            <RefreshCw className={cn("size-2.5", isVerifying && "animate-spin")} /> Re-verify
          </button>
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
              Mined on Sepolia — Block #{result.blockNumber}
            </div>
            <a
              href={etherscanTx(result.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
            >
              <ExternalLink className="size-2.5" />
              View Transaction on Etherscan
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
        <div className="text-[11px] font-mono text-muted-foreground">
          Sepolia Contract:{" "}
          <a
            href={etherscanAddress(CONTRACT_ADDRESS)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-bold"
          >
            {CONTRACT_ADDRESS.slice(0, 8)}…{CONTRACT_ADDRESS.slice(-6)}
          </a>
        </div>
        <button
          onClick={() => void handleCheckLive()}
          disabled={isVerifying}
          className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <RefreshCw className={cn("size-3", isVerifying && "animate-spin")} /> Check On-Chain
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {/* Instant server-relayed notarization (pre-funded wallet) */}
        <button
          id={`server-notarize-btn-${documentId}`}
          onClick={() => void handleServerRelayedNotarize()}
          disabled={relaying || isLoading}
          className="flex items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-primary-foreground hover:opacity-95 disabled:opacity-50 cursor-pointer shadow-xs"
          title="Anchors hash immediately on Sepolia using funded relay wallet"
        >
          {relaying ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Zap className="size-3.5 fill-current" />
          )}
          {relaying ? "Mining on Sepolia…" : "1-Click Notarize to Sepolia"}
        </button>

        {/* MetaMask wallet notarization */}
        <button
          id={`notarize-btn-${documentId}`}
          onClick={() => void handleMetaMaskNotarize()}
          disabled={isLoading || !isConnected || relaying}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-sm border px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
            isLoading
              ? "border-primary/30 bg-primary/10 text-primary/70"
              : "border-border bg-background text-foreground hover:bg-accent hover:border-primary/50",
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
      </div>

      {/* Wallet connection banner if not connected */}
      {!isConnected && (
        <div className="flex items-center justify-between rounded-sm border border-border bg-muted/20 px-3 py-2">
          <span className="text-[10px] font-mono text-muted-foreground">
            Want to notarize using your personal MetaMask?
          </span>
          <WalletButton />
        </div>
      )}

      {/* Errors */}
      {(error || relayError) && (
        <div className="flex items-start gap-1.5 rounded-sm border border-destructive/30 bg-destructive/10 p-2.5 text-[10px] text-destructive">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          {error || relayError}
        </div>
      )}

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

