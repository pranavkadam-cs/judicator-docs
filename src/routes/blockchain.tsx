import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/dms/shell";
import { Label, Panel, Stat, formatDate } from "@/components/dms/primitives";
import { getBlockchainLedgerFn, verifyBlockchainEntryFn } from "@/lib/dms.functions";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  ShieldAlert,
  Link2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Database,
  Activity,
  Cpu,
  FileText,
  Search,
  ExternalLink,
  Copy,
  Eye,
  X,
  Key,
  BadgeCheck,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WalletButton } from "@/lib/ethereum/WalletButton";
import { NotarizeButton } from "@/lib/ethereum/NotarizeButton";
import { DeployContractButton } from "@/lib/ethereum/DeployContractModal";
import { useTotalNotarized, useVerifyOnChain } from "@/lib/ethereum/useVerifyOnChain";
import { useAccount } from "wagmi";
import { isConfigured, ETH_NETWORK, CONTRACT_ADDRESS, etherscanAddress } from "@/lib/ethereum/config";


export const Route = createFileRoute("/blockchain")({
  component: BlockchainPage,
});

const EVENT_STYLES: Record<string, { label: string; cls: string }> = {
  DOCUMENT_NOTARIZED: { label: "Notarized", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  DOCUMENT_SIGNED: { label: "Signed", cls: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  TAMPER_DETECTED: { label: "Tamper", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  INTEGRITY_VERIFIED: { label: "Verified", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
};

function EventTypeBadge({ type }: { type: string }) {
  const s = EVENT_STYLES[type] ?? { label: type, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={cn("inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider", s.cls)}>
      {s.label}
    </span>
  );
}

function ChainBadge({ valid }: { valid: boolean }) {
  return valid ? (
    <span className="inline-flex items-center gap-1 text-green-400 font-mono text-[9px] font-bold uppercase">
      <CheckCircle2 className="size-3" /> Valid
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-destructive font-mono text-[9px] font-bold uppercase">
      <XCircle className="size-3" /> Broken
    </span>
  );
}

function SetupStep({ step, title, status, detail }: { step: number; title: string; status: "done" | "pending"; detail: string }) {
  return (
    <div className={cn(
      "rounded-sm border p-3 space-y-1 transition-colors",
      status === "done" ? "border-green-500/30 bg-green-500/5" : "border-border bg-surface"
    )}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold text-muted-foreground uppercase">Step {step}</span>
        {status === "done" ? (
          <CheckCircle2 className="size-3.5 text-green-400" />
        ) : (
          <span className="size-3.5 rounded-full border-2 border-muted-foreground/30" />
        )}
      </div>
      <div className="text-xs font-bold text-foreground">{title}</div>
      <div className={cn("text-[10px] font-mono", status === "done" ? "text-green-400" : "text-muted-foreground")}>{detail}</div>
    </div>
  );
}

function StepInstruction({ step, title, done, children }: { step: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-sm border p-3 space-y-2", done ? "border-green-500/20 bg-green-500/5" : "border-border")}>
      <div className="flex items-center gap-2">
        {done ? (
          <CheckCircle2 className="size-4 text-green-400 shrink-0" />
        ) : (
          <span className="flex size-4 items-center justify-center rounded-full border border-primary text-[9px] font-bold text-primary shrink-0">{step}</span>
        )}
        <span className={cn("text-xs font-bold", done ? "text-green-400" : "text-foreground")}>{title}</span>
        {done && <span className="text-[9px] font-mono text-green-400 font-bold uppercase ml-auto">Complete</span>}
      </div>
      {!done && <div className="pl-6">{children}</div>}
    </div>
  );
}

function EnvRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-bold", ok ? "text-green-400" : "text-caution")}>{value}</span>
    </div>
  );
}

/** Shows live Ethereum notarization status for a given SHA-256 hash */
function EthereumStatusCell({ sha256Hash, showFull = false }: { sha256Hash: string; showFull?: boolean }) {
  const { isNotarized, result, isPending } = useVerifyOnChain(sha256Hash);

  if (!isConfigured) {
    return <span className="font-mono text-[9px] text-muted-foreground">—</span>;
  }

  if (isPending) {
    return <span className="font-mono text-[9px] text-muted-foreground animate-pulse">Checking…</span>;
  }

  if (isNotarized && result) {
    const ts = new Date(result.timestamp * 1000).toLocaleString();
    if (showFull) {
      return (
        <div className="space-y-1.5 text-xs font-mono">
          <div className="flex items-center gap-1 text-green-400 font-bold text-[10px]">
            <CheckCircle2 className="size-3" /> On-Chain — Ethereum Verified
          </div>
          <div className="text-muted-foreground text-[10px]">
            <div>Notarized By: <span className="text-foreground">{result.notarizedBy.slice(0, 10)}…{result.notarizedBy.slice(-6)}</span></div>
            <div>Timestamp: <span className="text-foreground">{ts}</span></div>
          </div>
          <a
            href={etherscanAddress(CONTRACT_ADDRESS)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            View Contract on Etherscan <ExternalLink className="size-2.5" />
          </a>
        </div>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-green-400 font-mono text-[9px] font-bold" title={`Notarized by ${result.notarizedBy} at ${ts}`}>
        <CheckCircle2 className="size-3" /> On-Chain
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground font-mono text-[9px]" title="This document has not been notarized on Ethereum. Click 'Notarize on Ethereum' on the document page.">
      <Globe className="size-2.5 opacity-50" /> Not on Ethereum
    </span>
  );
}

function BlockchainPage() {
  const [verifiedTxs, setVerifiedTxs] = useState<Record<string, boolean>>({});
  const [verifyingTx, setVerifyingTx] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTx, setSelectedTx] = useState<any | null>(null);

  const { isConnected } = useAccount();
  const { total: onChainCount } = useTotalNotarized();

  const getLedger = useServerFn(getBlockchainLedgerFn);
  const verifyEntry = useServerFn(verifyBlockchainEntryFn);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["blockchain-ledger"],
    queryFn: () => getLedger({ data: {} }),
    refetchInterval: 10_000,
  });

  const ledger = data?.ledger;
  const chainStatus = data?.chainStatus;
  const transactions = ledger?.transactions ?? [];

  async function handleVerify(txId: string) {
    setVerifyingTx(txId);
    try {
      const result = await verifyEntry({ data: { txId } });
      setVerifiedTxs((prev) => ({ ...prev, [txId]: result.chainValid }));
      if (result.chainValid) {
        toast.success(`Block #${result.blockIndex} — Chain Valid`, {
          description: `Cryptographic seal verified: ${txId.slice(0, 16)}…`,
        });
      } else {
        toast.error(`Block #${result.blockIndex} — Chain Compromised`, {
          description: "Hash mismatch detected. This record has been altered.",
        });
      }
    } catch (e: any) {
      toast.error("Verification failed", { description: e.message });
    } finally {
      setVerifyingTx(null);
    }
  }

  const totalBlocks = chainStatus?.totalBlocks ?? transactions.length;
  const chainValid = chainStatus?.valid ?? true;

  // Filtered transactions for quick search
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase().trim();
    return transactions.filter(
      (tx) =>
        tx.sha256Hash.toLowerCase().includes(q) ||
        tx.txId.toLowerCase().includes(q) ||
        tx.documentName.toLowerCase().includes(q) ||
        tx.documentId.toLowerCase().includes(q) ||
        tx.actorName.toLowerCase().includes(q)
    );
  }, [transactions, searchQuery]);

  return (
    <AppShell
      title="Blockchain Ledger"
      subtitle="Forensic Chain of Custody & Ethereum Notary"
      actions={
        <div className="flex items-center gap-2">
          <WalletButton />
          <button
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
          >
            <RefreshCw className="size-3" /> Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Security Status Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-border bg-muted/20 p-4">
          <div className="flex items-center gap-3">
            {chainValid ? (
              <div className="flex size-9 items-center justify-center rounded-sm bg-green-500/10 text-green-400 border border-green-500/30">
                <ShieldCheck className="size-5" />
              </div>
            ) : (
              <div className="flex size-9 items-center justify-center rounded-sm bg-destructive/10 text-destructive border border-destructive/30">
                <ShieldAlert className="size-5" />
              </div>
            )}
            <div>
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                {chainValid ? "Chain of Custody: Cryptographically Intact" : "Security Warning: Chain Broken"}
                <span className="inline-block size-2 rounded-full bg-green-400 animate-pulse" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {totalBlocks} blocks linked by immutable SHA-256 hashes · Constant-time verification active
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isConfigured ? (
              <div className="flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-1.5 text-[11px] font-mono">
                <span className="size-2 rounded-full bg-green-400" />
                <span className="text-muted-foreground">Ethereum:</span>
                <span className="font-bold text-foreground">
                  {ETH_NETWORK === "sepolia" ? "Sepolia Testnet" : "Mainnet"}
                </span>
                {isConnected && (
                  <span className="text-[10px] text-primary">· MetaMask Connected</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-1.5 text-[11px] font-mono text-muted-foreground">
                <span className="size-2 rounded-full bg-muted-foreground" />
                <span>Local Chained Mode</span>
              </div>
            )}
          </div>
        </div>

        {/* Key Security Stats */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-entry">
          <Stat
            label="Sealed Blocks"
            value={totalBlocks}
            hint="cryptographic chain links"
          />
          <Stat
            label="Notarized Docs"
            value={transactions.filter((t) => t.eventType === "DOCUMENT_NOTARIZED").length}
            hint="authoritative SHA-256 seals"
          />
          <Stat
            label="Digital Signatures"
            value={transactions.filter((t) => t.eventType === "DOCUMENT_SIGNED").length}
            hint="tamper-evident signatures"
          />
          <Stat
            label="Ethereum Contract"
            value={isConfigured ? (onChainCount !== null ? `${onChainCount} on-chain` : "Active") : "Ready"}
            hint={isConfigured && CONTRACT_ADDRESS ? `${CONTRACT_ADDRESS.slice(0, 6)}…${CONTRACT_ADDRESS.slice(-4)}` : "DocumentNotary.sol"}
          />
        </div>

        {/* Ethereum Smart Contract Notary Network */}
        <Panel className="p-4 bg-primary/5 border-primary/20 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cpu className="size-4 text-primary" />
              <Label>Ethereum Smart Contract Notary · EVM Blockchain</Label>
              <span className="font-mono text-[9px] bg-primary/15 text-primary border border-primary/30 rounded-sm px-1.5 py-0.5 font-bold uppercase">
                {ETH_NETWORK === "sepolia" ? "Sepolia Testnet (Chain ID 11155111)" : "Ethereum Mainnet"}
              </span>
            </div>
            {isConfigured && CONTRACT_ADDRESS && (
              <a
                href={etherscanAddress(CONTRACT_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
              >
                View on Etherscan <ExternalLink className="size-2.5" />
              </a>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3 text-xs font-mono">
            <div className="rounded-sm border border-border bg-background p-3">
              <div className="text-muted-foreground text-[10px] uppercase">Contract Address</div>
              <div className="mt-1 font-bold text-foreground truncate" title={CONTRACT_ADDRESS}>
                {isConfigured && CONTRACT_ADDRESS ? `${CONTRACT_ADDRESS.slice(0, 10)}…${CONTRACT_ADDRESS.slice(-8)}` : "Not Deployed"}
              </div>
            </div>
            <div className="rounded-sm border border-border bg-background p-3">
              <div className="text-muted-foreground text-[10px] uppercase">RPC Infrastructure</div>
              <div className="mt-1 font-bold text-foreground">
                Alchemy Web3 JSON-RPC
              </div>
            </div>
            <div className="rounded-sm border border-border bg-background p-3">
              <div className="text-muted-foreground text-[10px] uppercase">On-Chain Document Seals</div>
              <div className="mt-1 font-bold text-green-400 flex items-center gap-1">
                <CheckCircle2 className="size-3" />
                {onChainCount !== null ? `${onChainCount} documents anchored` : "Live"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/50">
            <p className="text-[11px] text-muted-foreground">
              Anchoring documents to Ethereum permanently records their SHA-256 hash, document ID, timestamp, and wallet address.
            </p>
            <DeployContractButton />
          </div>
        </Panel>

        {/* Alchemy Integration Setup Guide */}
        <Panel className="p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Cpu className="size-4 text-primary" />
            <Label>Alchemy Blockchain Integration — End-to-End Setup</Label>
          </div>

          <div className="space-y-4">
            {/* Status Overview */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SetupStep
                step={1}
                title="Ethereum RPC"
                status="done"
                detail={import.meta.env["VITE_ALCHEMY_RPC_URL"] ? "Alchemy Sepolia RPC" : "Sepolia Public RPC Active"}
              />
              <SetupStep
                step={2}
                title="MetaMask Wallet"
                status={isConnected ? "done" : "pending"}
                detail={isConnected ? "Wallet connected" : "Connect wallet above"}
              />
              <SetupStep
                step={3}
                title="Contract Deployed"
                status={isConfigured && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" ? "done" : "pending"}
                detail={isConfigured ? `${CONTRACT_ADDRESS.slice(0, 8)}…` : "Deploy with button above"}
              />
              <SetupStep
                step={4}
                title="Documents Notarized"
                status={onChainCount > 0 ? "done" : "pending"}
                detail={onChainCount > 0 ? `${onChainCount} on-chain` : "Notarize from document page"}
              />
            </div>

            {/* Step-by-step instructions */}
            <div className="rounded-sm border border-border bg-background p-4 space-y-4">
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Complete Setup Instructions
              </div>

              <div className="space-y-3 text-xs">
                <StepInstruction
                  step={1}
                  title="Create Alchemy Account & Get API Key"
                  done={Boolean(import.meta.env["VITE_ALCHEMY_RPC_URL"])}
                >
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Go to <a href="https://dashboard.alchemy.com/signup" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">dashboard.alchemy.com <ExternalLink className="size-2.5" /></a></li>
                    <li>Create a free account and create a new <strong className="text-foreground">Ethereum App</strong></li>
                    <li>Select <strong className="text-foreground">Sepolia</strong> as the network</li>
                    <li>Copy the <strong className="text-foreground">HTTPS</strong> URL (e.g., <code className="bg-muted px-1 rounded text-foreground">https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY</code>)</li>
                    <li>Paste it into <code className="bg-muted px-1 rounded text-foreground">.env</code> as <code className="text-primary font-bold">VITE_ALCHEMY_RPC_URL</code></li>
                  </ol>
                </StepInstruction>

                <StepInstruction
                  step={2}
                  title="Install MetaMask & Get Sepolia ETH"
                  done={isConnected}
                >
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Install <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">MetaMask <ExternalLink className="size-2.5" /></a> browser extension</li>
                    <li>Create a wallet and switch to <strong className="text-foreground">Sepolia Test Network</strong></li>
                    <li>Get free Sepolia ETH from <a href="https://faucets.chain.link/sepolia" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">Chainlink Faucet <ExternalLink className="size-2.5" /></a> or <a href="https://www.alchemy.com/faucets/ethereum-sepolia" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">Alchemy Faucet <ExternalLink className="size-2.5" /></a></li>
                    <li>Click <strong className="text-foreground">"Connect MetaMask"</strong> button above to link your wallet</li>
                  </ol>
                </StepInstruction>

                <StepInstruction
                  step={3}
                  title="Deploy DocumentNotary.sol Smart Contract"
                  done={isConfigured && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000"}
                >
                  <div className="space-y-1 text-muted-foreground">
                    <p><strong className="text-foreground">Option A — One-Click Deploy from UI</strong> (Recommended):</p>
                    <ol className="list-decimal list-inside space-y-0.5 pl-2">
                      <li>Connect your MetaMask wallet (Step 2 above)</li>
                      <li>Click <strong className="text-foreground">"Deploy Smart Contract with MetaMask"</strong> button above</li>
                      <li>Confirm the transaction in MetaMask popup</li>
                      <li>Wait ~12 seconds for Sepolia block confirmation</li>
                      <li>Contract address auto-saves to <code className="bg-muted px-1 rounded text-foreground">.env</code></li>
                    </ol>
                    <p className="mt-2"><strong className="text-foreground">Option B — Deploy via Hardhat CLI</strong>:</p>
                    <div className="bg-muted/50 rounded-sm border border-border p-2 font-mono text-[10px] mt-1">
                      <div className="text-muted-foreground"># Add your MetaMask private key to .env</div>
                      <div className="text-foreground">SEPOLIA_PRIVATE_KEY=your_metamask_private_key</div>
                      <div className="text-muted-foreground mt-1"># Deploy</div>
                      <div className="text-foreground">npx hardhat run scripts/deploy.cjs --network sepolia</div>
                    </div>
                    <p className="mt-2"><strong className="text-foreground">Option C — Deploy via Remix IDE</strong>:</p>
                    <ol className="list-decimal list-inside space-y-0.5 pl-2">
                      <li>Open <a href="https://remix.ethereum.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">remix.ethereum.org <ExternalLink className="size-2.5" /></a></li>
                      <li>Paste <code className="bg-muted px-1 rounded text-foreground">contracts/DocumentNotary.sol</code> contents</li>
                      <li>Compile with Solidity 0.8.20</li>
                      <li>Deploy using "Injected Provider - MetaMask"</li>
                      <li>Copy the deployed address to <code className="text-primary font-bold">VITE_CONTRACT_ADDRESS</code> in <code className="bg-muted px-1 rounded text-foreground">.env</code></li>
                    </ol>
                  </div>
                </StepInstruction>

                <StepInstruction
                  step={4}
                  title="Notarize Documents on Ethereum"
                  done={onChainCount > 0}
                >
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Navigate to any <strong className="text-foreground">Document Detail</strong> page</li>
                    <li>Click the <strong className="text-foreground">"Blockchain"</strong> tab</li>
                    <li>Click <strong className="text-foreground">"Notarize on Ethereum"</strong></li>
                    <li>Confirm the transaction in MetaMask</li>
                    <li>Once confirmed, the document's SHA-256 hash is <strong className="text-foreground">permanently anchored on Ethereum</strong></li>
                    <li>View the proof on <a href="https://sepolia.etherscan.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">Sepolia Etherscan <ExternalLink className="size-2.5" /></a></li>
                  </ol>
                </StepInstruction>
              </div>
            </div>

            {/* Current .env Status */}
            <div className="rounded-sm border border-border bg-muted/20 p-4 space-y-2">
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Current Ethereum Environment Configuration
              </div>
              <div className="font-mono text-[11px] space-y-1">
                <EnvRow
                  label="VITE_ALCHEMY_RPC_URL"
                  value={import.meta.env["VITE_ALCHEMY_RPC_URL"] ? `${String(import.meta.env["VITE_ALCHEMY_RPC_URL"]).slice(0, 42)}…` : "Not Set"}
                  ok={Boolean(import.meta.env["VITE_ALCHEMY_RPC_URL"])}
                />
                <EnvRow
                  label="VITE_ALCHEMY_API_KEY"
                  value={import.meta.env["VITE_ALCHEMY_API_KEY"] ? `${String(import.meta.env["VITE_ALCHEMY_API_KEY"]).slice(0, 12)}…` : "Not Set"}
                  ok={Boolean(import.meta.env["VITE_ALCHEMY_API_KEY"])}
                />
                <EnvRow label="VITE_ETH_NETWORK" value={ETH_NETWORK} ok={true} />
                <EnvRow
                  label="VITE_CONTRACT_ADDRESS"
                  value={CONTRACT_ADDRESS ? `${CONTRACT_ADDRESS.slice(0, 12)}…${CONTRACT_ADDRESS.slice(-6)}` : "Not Set"}
                  ok={isConfigured}
                />
              </div>
            </div>
          </div>
        </Panel>

        {/* Quick Hash Verification Tool */}
        <Panel className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-primary" />
              <Label>Forensic Hash &amp; Block Lookup</Label>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              Filter by SHA-256, Tx ID, Document Name, or Investigator
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Paste SHA-256 digest or transaction hash to verify…"
              className="w-full rounded-sm border border-border bg-background pl-9 pr-4 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </Panel>

        {/* Ledger Transactions Table */}
        <Panel className="p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Link2 className="size-4 text-primary" />
              <Label>Immutable Audit Ledger</Label>
              {searchQuery && (
                <span className="font-mono text-[9px] bg-primary/10 text-primary border border-primary/20 rounded-sm px-1.5 py-0.5">
                  {filteredTransactions.length} of {transactions.length} matching
                </span>
              )}
            </div>
            {isConfigured && CONTRACT_ADDRESS && (
              <a
                href={etherscanAddress(CONTRACT_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
              >
                Smart Contract on Etherscan <ExternalLink className="size-2.5" />
              </a>
            )}
          </div>

          {isPending && (
            <div className="p-8 text-center text-xs text-muted-foreground">Loading ledger transactions…</div>
          )}

          {Boolean(error) && (
            <div className="p-8 text-center text-xs text-destructive">
              Failed to load ledger: {error instanceof Error ? error.message : "Unknown error"}
            </div>
          )}

          {!isPending && filteredTransactions.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Database className="size-8 text-muted-foreground/40" />
              <div className="text-sm font-semibold text-foreground">
                {searchQuery ? "No matching blocks found" : "No blockchain transactions yet"}
              </div>
              <p className="text-xs text-muted-foreground max-w-sm">
                {searchQuery
                  ? "Try searching with a partial SHA-256 hash or document ID."
                  : "Upload a document to anchor the first cryptographic block into the chain of custody."}
              </p>
            </div>
          )}

          {filteredTransactions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Block</th>
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Event</th>
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Document</th>
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">SHA-256 Digest</th>
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground" title="Local chained ledger hash — NOT an Ethereum transaction hash">Block Hash (Local)</th>
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Ethereum</th>
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Actor</th>
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Timestamp</th>
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Chain Seal</th>
                    <th className="px-4 py-2.5 text-right font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...filteredTransactions].reverse().map((tx) => {
                    const verifiedState = verifiedTxs[tx.txId];
                    const isVerifying = verifyingTx === tx.txId;
                    return (
                      <tr key={tx.txId} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-[10px] font-bold text-primary">#{tx.blockIndex}</span>
                        </td>
                        <td className="px-4 py-3"><EventTypeBadge type={tx.eventType} /></td>
                        <td className="px-4 py-3 max-w-[170px]">
                          <Link
                            to="/documents/$docId"
                            params={{ docId: tx.documentId }}
                            className="text-xs text-foreground hover:text-primary hover:underline truncate block"
                          >
                            <div className="flex items-center gap-1">
                              <FileText className="size-3 shrink-0 text-muted-foreground" />
                              <span className="truncate">{tx.documentName}</span>
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="font-mono text-[9px] text-muted-foreground cursor-pointer hover:text-foreground inline-flex items-center gap-1"
                            title="Click to copy full SHA-256"
                            onClick={() => {
                              void navigator.clipboard.writeText(tx.sha256Hash);
                              toast.success("SHA-256 copied to clipboard");
                            }}
                          >
                            {tx.sha256Hash.slice(0, 8)}…{tx.sha256Hash.slice(-6)}
                            <Copy className="size-2.5 opacity-60" />
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="font-mono text-[9px] text-muted-foreground cursor-pointer hover:text-foreground inline-flex items-center gap-1"
                            title="Local chain block hash — NOT an Ethereum tx hash. This is computed as sha256(prevTxId:metadataHash:timestamp)"
                            onClick={() => {
                              void navigator.clipboard.writeText(tx.txId);
                              toast.success("Local block hash copied (not Ethereum tx)");
                            }}
                          >
                            {tx.txId.slice(0, 10)}…
                            <Copy className="size-2.5 opacity-60" />
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <EthereumStatusCell sha256Hash={tx.sha256Hash} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-foreground">{tx.actorName}</div>
                          <div className="font-mono text-[9px] text-muted-foreground">{tx.actorRole}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-[10px] text-muted-foreground">{formatDate(tx.timestamp)}</span>
                        </td>
                        <td className="px-4 py-3">
                          {verifiedState !== undefined ? (
                            <ChainBadge valid={verifiedState} />
                          ) : (
                            <span className="font-mono text-[9px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedTx(tx)}
                              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
                              title="Inspect full file metadata stored on blockchain"
                            >
                              <Eye className="size-2.5 text-primary" />
                              Metadata
                            </button>
                            <button
                              onClick={() => void handleVerify(tx.txId)}
                              disabled={isVerifying}
                              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer disabled:opacity-40"
                            >
                              {isVerifying ? <RefreshCw className="size-2.5 animate-spin" /> : <Activity className="size-2.5" />}
                              Verify
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Chain Information Footer */}
        {ledger && (
          <div className="flex flex-wrap items-center gap-4 rounded-sm border border-border bg-muted/20 px-4 py-3 text-[10px] text-muted-foreground font-mono">
            <span>Protocol: <strong className="text-foreground">Vigil.OS SHA-256 Ledger</strong></span>
            <span>Genesis: <strong className="text-foreground">{ledger.genesisHash.slice(0, 10)}…</strong></span>
            <span>Last Sync: <strong className="text-foreground">{formatDate(ledger.lastUpdatedAt)}</strong></span>
            <span className="ml-auto">
              Vault: <strong className="text-foreground">.data/blockchain-ledger.json</strong>
            </span>
          </div>
        )}

        {/* Metadata Inspection Modal */}
        {selectedTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <div className="w-full max-w-2xl rounded-sm border border-border bg-background p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Database className="size-5 text-primary" />
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                    Block #{selectedTx.blockIndex} — Metadata Payload & Chain Link
                  </h3>
                </div>
                <button onClick={() => setSelectedTx(null)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                  <X className="size-4" />
                </button>
              </div>

              {/* Document Metadata Fields */}
              <div className="space-y-3">
                <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  1. Document & Metadata Identity
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono rounded-sm border border-border bg-muted/20 p-3">
                  <div>
                    <span className="text-muted-foreground">Document Name:</span>
                    <div className="font-bold text-foreground truncate">{selectedTx.documentName}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ref ID / Docket:</span>
                    <div className="font-bold text-primary">{selectedTx.refId || selectedTx.documentId}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Category:</span>
                    <div className="font-bold text-foreground">{selectedTx.category || "Evidence Record"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Classification:</span>
                    <div className="font-bold text-seal">{selectedTx.classification || "CONFIDENTIAL"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status / Version:</span>
                    <div className="font-bold text-foreground">{selectedTx.status || "SEALED"} ({selectedTx.version || "v1.0"})</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">File Size:</span>
                    <div className="font-bold text-foreground">{selectedTx.fileSize ? `${(selectedTx.fileSize / 1024).toFixed(1)} KB` : "Stored"}</div>
                  </div>
                </div>
              </div>

              {/* Cryptographic Hashes */}
              <div className="space-y-3">
                <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  2. Cryptographic Proofs & Chain Linkage
                </div>
                <div className="space-y-2 font-mono text-xs text-muted-foreground">
                  <div className="rounded-sm border border-border bg-background p-2.5">
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold text-foreground mb-1">
                      <span>Authoritative Payload SHA-256 Digest</span>
                      <Copy
                        className="size-3 cursor-pointer hover:text-primary"
                        onClick={() => {
                          void navigator.clipboard.writeText(selectedTx.sha256Hash);
                          toast.success("Payload hash copied");
                        }}
                      />
                    </div>
                    <div className="break-all font-bold text-primary">{selectedTx.sha256Hash}</div>
                  </div>

                  <div className="rounded-sm border border-border bg-background p-2.5">
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold text-foreground mb-1">
                      <span>Canonical Metadata SHA-256 Digest (metadataHash)</span>
                      <Copy
                        className="size-3 cursor-pointer hover:text-primary"
                        onClick={() => {
                          void navigator.clipboard.writeText(selectedTx.metadataHash);
                          toast.success("Metadata hash copied");
                        }}
                      />
                    </div>
                    <div className="break-all font-bold text-foreground">{selectedTx.metadataHash}</div>
                  </div>

                  <div className="rounded-sm border border-border bg-background p-2.5">
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold text-foreground mb-1">
                      <span>Local Block Hash (sha256(prevTxId:metadataHash:timestamp))</span>
                      <Copy
                        className="size-3 cursor-pointer hover:text-primary"
                        onClick={() => {
                          void navigator.clipboard.writeText(selectedTx.txId);
                          toast.success("Local block hash copied");
                        }}
                      />
                    </div>
                    <div className="break-all font-bold text-foreground">{selectedTx.txId}</div>
                    <div className="mt-1 text-[9px] text-amber-400">
                      ⚠ This is the local chained ledger hash, NOT an Ethereum transaction hash. Do not look this up on Etherscan.
                    </div>
                  </div>
                  <div className="rounded-sm border border-primary/30 bg-primary/5 p-2.5">
                    <div className="text-[10px] uppercase font-bold text-primary mb-1 flex items-center gap-1">
                      <Globe className="size-3" /> Ethereum Notarization Status
                    </div>
                    <EthereumStatusCell sha256Hash={selectedTx.sha256Hash} showFull />
                    <div className="mt-2.5 pt-2.5 border-t border-primary/20">
                      <NotarizeButton
                        sha256Hash={selectedTx.sha256Hash}
                        documentId={selectedTx.documentId}
                        documentName={selectedTx.documentName}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Digital Signature Details if Present */}
              {selectedTx.digitalSignature && (
                <div className="space-y-3">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">
                    <Key className="size-3" /> 3. RSA-SHA256 Digital Signature Payload
                  </div>
                  <div className="rounded-sm border border-purple-500/30 bg-purple-500/5 p-3 space-y-2 text-xs font-mono">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground">Signer:</span>
                        <div className="font-bold text-foreground">{selectedTx.digitalSignature.signerName} ({selectedTx.digitalSignature.signerRole})</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Signed At:</span>
                        <div className="font-bold text-foreground">{formatDate(selectedTx.digitalSignature.signedAt)}</div>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">RSA-2048 Signature Bytes (Hex):</span>
                      <div className="break-all text-[10px] font-bold text-purple-400 mt-0.5 bg-background p-2 rounded-xs border border-border">
                        {selectedTx.digitalSignature.signatureHex}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-border">
                <button
                  onClick={() => setSelectedTx(null)}
                  className="rounded-sm bg-primary px-4 py-1.5 font-mono text-xs font-bold text-primary-foreground hover:bg-primary/90 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
