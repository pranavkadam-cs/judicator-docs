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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WalletButton } from "@/lib/ethereum/WalletButton";
import { DeployContractButton } from "@/lib/ethereum/DeployContractModal";
import { useTotalNotarized } from "@/lib/ethereum/useVerifyOnChain";
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

function BlockchainPage() {
  const [verifiedTxs, setVerifiedTxs] = useState<Record<string, boolean>>({});
  const [verifyingTx, setVerifyingTx] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Tx Hash</th>
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Actor</th>
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Timestamp</th>
                    <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Chain Seal</th>
                    <th className="px-4 py-2.5 text-right font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Action</th>
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
                            title="Click to copy Tx ID"
                            onClick={() => {
                              void navigator.clipboard.writeText(tx.txId);
                              toast.success("Transaction ID copied to clipboard");
                            }}
                          >
                            {tx.txId.slice(0, 10)}…
                            <Copy className="size-2.5 opacity-60" />
                          </span>
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
                          <button
                            onClick={() => void handleVerify(tx.txId)}
                            disabled={isVerifying}
                            className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer disabled:opacity-40"
                          >
                            {isVerifying ? <RefreshCw className="size-2.5 animate-spin" /> : <Activity className="size-2.5" />}
                            Verify
                          </button>
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
      </div>
    </AppShell>
  );
}
