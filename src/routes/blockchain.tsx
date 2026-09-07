import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
          description: `Tx: ${txId.slice(0, 16)}...`,
        });
      } else {
        toast.error(`Block #${result.blockIndex} — Chain BROKEN`, {
          description: "Hash mismatch detected. This entry may have been tampered with.",
        });
      }
    } catch (e: any) {
      toast.error("Verification failed", { description: e.message });
    } finally {
      setVerifyingTx(null);
    }
  }

  const isSimulation = transactions.some((t) => t.simulated);
  const totalBlocks = chainStatus?.totalBlocks ?? 0;
  const chainValid = chainStatus?.valid ?? true;

  return (
    <AppShell title="Blockchain Ledger" subtitle="Immutable Document Notary">
      {/* Mode Banner */}
      <div
        className={cn(
          "mb-6 flex items-center gap-3 rounded-sm border px-4 py-3 text-xs",
          isSimulation
            ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
            : "border-green-500/30 bg-green-500/10 text-green-400",
        )}
      >
        <Cpu className="size-4 shrink-0" />
        <div>
          <div className="font-mono font-bold uppercase tracking-wider">
            {isSimulation ? "🔗 Simulation Mode — Local Cryptographic Ledger" : "🌐 Live Mode — Hyperledger Fabric"}
          </div>
          <p className="mt-0.5 text-[10px] opacity-80">
            {isSimulation
              ? "Document hashes are anchored to a locally-chained SHA-256 ledger (.data/blockchain-ledger.json). Set FABRIC_PEER_ENDPOINT in .env to connect to a live Hyperledger Fabric peer."
              : "Document hashes are being submitted to a live Hyperledger Fabric peer. All transactions are immutably recorded on the distributed ledger."}
          </p>
        </div>
        <div className="ml-auto shrink-0">
          {chainValid ? (
            <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-green-400">
              <ShieldCheck className="size-4" /> Chain Intact
            </span>
          ) : (
            <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-destructive">
              <ShieldAlert className="size-4" /> Chain Compromised at Block #{chainStatus?.brokenAtBlock}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-entry">
        <Stat
          label="Total anchored"
          value={totalBlocks}
          hint="blockchain transactions"
        />
        <Stat
          label="Notarized"
          value={transactions.filter((t) => t.eventType === "DOCUMENT_NOTARIZED").length}
          hint="document uploads"
        />
        <Stat
          label="Signatures"
          value={transactions.filter((t) => t.eventType === "DOCUMENT_SIGNED").length}
          hint="digital signatures"
        />
        <Stat
          label="Tamper events"
          value={transactions.filter((t) => t.eventType === "TAMPER_DETECTED").length}
          hint="integrity violations"
        />
      </div>

      {/* Ledger Table */}
      <Panel className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Link2 className="size-4 text-primary" />
            <Label>Ledger Transactions</Label>
            {ledger?.chainId && (
              <span className="font-mono text-[9px] text-muted-foreground border border-border rounded-sm px-1.5 py-0.5">
                {ledger.chainId}
              </span>
            )}
          </div>
          <button
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer"
          >
            <RefreshCw className="size-3" /> Refresh
          </button>
        </div>

        {isPending && (
          <div className="p-8 text-center text-xs text-muted-foreground">Loading ledger…</div>
        )}
        {error && (
          <div className="p-8 text-center text-xs text-destructive">Failed to load ledger: {String(error)}</div>
        )}
        {!isPending && transactions.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Database className="size-8 text-muted-foreground/40" />
            <div className="text-sm font-semibold text-foreground">No blockchain transactions yet</div>
            <p className="text-xs text-muted-foreground max-w-sm">
              Upload a document, verify its integrity, or apply a digital signature to anchor the first transaction to the ledger.
            </p>
          </div>
        )}

        {transactions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Block</th>
                  <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Event</th>
                  <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Document</th>
                  <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">SHA-256</th>
                  <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Tx ID</th>
                  <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Actor</th>
                  <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Timestamp</th>
                  <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Chain</th>
                  <th className="px-4 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...transactions].reverse().map((tx) => {
                  const verifiedState = verifiedTxs[tx.txId];
                  const isVerifying = verifyingTx === tx.txId;
                  return (
                    <tr key={tx.txId} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-[10px] font-bold text-primary">#{tx.blockIndex}</span>
                      </td>
                      <td className="px-4 py-3">
                        <EventTypeBadge type={tx.eventType} />
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
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
                          className="font-mono text-[9px] text-muted-foreground cursor-pointer hover:text-foreground"
                          title={tx.sha256Hash}
                          onClick={() => {
                            void navigator.clipboard.writeText(tx.sha256Hash);
                            toast.success("Hash copied");
                          }}
                        >
                          {tx.sha256Hash.slice(0, 8)}…{tx.sha256Hash.slice(-6)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-[9px] text-muted-foreground cursor-pointer hover:text-foreground"
                          title={tx.txId}
                          onClick={() => {
                            void navigator.clipboard.writeText(tx.txId);
                            toast.success("Tx ID copied");
                          }}
                        >
                          {tx.txId.slice(0, 10)}…
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
                      <td className="px-4 py-3">
                        <button
                          onClick={() => void handleVerify(tx.txId)}
                          disabled={isVerifying}
                          className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-foreground hover:bg-accent cursor-pointer disabled:opacity-40"
                        >
                          {isVerifying ? (
                            <RefreshCw className="size-2.5 animate-spin" />
                          ) : (
                            <Activity className="size-2.5" />
                          )}
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

      {/* Chain Info Footer */}
      {ledger && (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-sm border border-border bg-muted/20 px-4 py-3 text-[10px] text-muted-foreground font-mono">
          <span>Chain ID: <strong className="text-foreground">{ledger.chainId}</strong></span>
          <span>Genesis: <strong className="text-foreground">{ledger.genesisHash.slice(0, 12)}…</strong></span>
          <span>Last updated: <strong className="text-foreground">{formatDate(ledger.lastUpdatedAt)}</strong></span>
          <span className="ml-auto">
            Ledger: <strong className="text-foreground">.data/blockchain-ledger.json</strong>
          </span>
        </div>
      )}
    </AppShell>
  );
}
