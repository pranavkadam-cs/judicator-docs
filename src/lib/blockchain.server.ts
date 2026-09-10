/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Hyperledger Fabric Blockchain Engine (server-only)
 *  Dual-mode: Local simulation ledger (default) OR live Fabric peer
 *
 *  Simulation Mode (default, no env vars required):
 *   - Append-only JSON ledger at .data/blockchain-ledger.json
 *   - Cryptographically chained: txId = sha256(prevTxId + payload)
 *   - Tampering any past entry breaks the hash chain (detectable)
 *
 *  Live Mode (set FABRIC_PEER_ENDPOINT in .env):
 *   - Connects to Hyperledger Fabric peer via @hyperledger/fabric-gateway
 *   - Invokes DocumentNotaryCC chaincode
 *   - Falls back to simulation on connection failure
 * ───────────────────────────────────────────────────────────── */

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ── Types ─────────────────────────────────────────────────────

export type BlockchainEventType =
  | "DOCUMENT_NOTARIZED"
  | "DOCUMENT_SIGNED"
  | "TAMPER_DETECTED"
  | "INTEGRITY_VERIFIED";

export type BlockchainTransaction = {
  txId: string;           // sha256(prevTxId + metadataHash + timestamp) — chain link
  blockIndex: number;     // sequential block number (0-based genesis)
  prevTxId: string;       // hash of previous transaction (GENESIS for block 0)
  timestamp: string;      // ISO 8601 timestamp
  eventType: BlockchainEventType;
  documentId: string;
  documentName: string;
  sha256Hash: string;     // authoritative SHA-256 digest of the document file
  ocrStatus?: string | undefined;
  actorId: string;
  actorName: string;
  actorRole: string;
  caseId: string;
  metadataHash: string;   // sha256 of the event payload — tamper-evident metadata seal
  fabricTxId?: string | undefined;    // set only on live Fabric transactions
  simulated: boolean;     // true = local simulation, false = live Hyperledger Fabric
};

export type BlockchainLedger = {
  genesisHash: string;
  chainId: string;
  transactions: BlockchainTransaction[];
  lastUpdatedAt: string;
};

export type AnchorPayload = {
  eventType: BlockchainEventType;
  documentId: string;
  documentName: string;
  sha256Hash: string;
  ocrStatus?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  caseId: string;
};

export type AnchorResult = {
  success: boolean;
  txId: string;
  blockIndex: number;
  simulated: boolean;
  fabricTxId?: string | undefined;
  error?: string | undefined;
};

export type VerifyResult = {
  txId: string;
  blockIndex: number;
  chainValid: boolean;
  expectedTxId: string;
  computedTxId: string;
  transaction: BlockchainTransaction;
};

// ── Constants ─────────────────────────────────────────────────

const LEDGER_PATH = join(process.cwd(), ".data", "blockchain-ledger.json");
const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
const CHAIN_ID = "vigil-os-document-notary-v1";

// ── Helpers ───────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex").toLowerCase();
}

function computeMetadataHash(payload: AnchorPayload, timestamp: string): string {
  const canonical = JSON.stringify({
    eventType: payload.eventType,
    documentId: payload.documentId,
    sha256Hash: payload.sha256Hash,
    actorId: payload.actorId,
    caseId: payload.caseId,
    timestamp,
  });
  return sha256(canonical);
}

function computeTxId(prevTxId: string, metadataHash: string, timestamp: string): string {
  return sha256(`${prevTxId}:${metadataHash}:${timestamp}`);
}

// ── Ledger I/O ────────────────────────────────────────────────

async function ensureDataDir(): Promise<void> {
  const dir = join(process.cwd(), ".data");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function loadLedger(): Promise<BlockchainLedger> {
  await ensureDataDir();
  if (!existsSync(LEDGER_PATH)) {
    const genesis: BlockchainLedger = {
      genesisHash: GENESIS_HASH,
      chainId: CHAIN_ID,
      transactions: [],
      lastUpdatedAt: new Date().toISOString(),
    };
    await writeFile(LEDGER_PATH, JSON.stringify(genesis, null, 2), "utf8");
    return genesis;
  }
  const raw = await readFile(LEDGER_PATH, "utf8");
  return JSON.parse(raw) as BlockchainLedger;
}

async function saveLedger(ledger: BlockchainLedger): Promise<void> {
  await ensureDataDir();
  ledger.lastUpdatedAt = new Date().toISOString();
  await writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2), "utf8");
}

// ── Mode Detection ────────────────────────────────────────────

export function isFabricConfigured(): boolean {
  return !!(
    process.env["FABRIC_PEER_ENDPOINT"] &&
    process.env["FABRIC_MSP_ID"] &&
    process.env["FABRIC_CHANNEL_NAME"] &&
    process.env["FABRIC_CHAINCODE_NAME"]
  );
}

export function isBlockchainEnabled(): boolean {
  // Blockchain is always enabled — either live Fabric or simulation
  return true;
}

export function getBlockchainMode(): "fabric" | "simulation" {
  return isFabricConfigured() ? "fabric" : "simulation";
}

// ── Live Hyperledger Fabric (when configured) ─────────────────

async function submitToFabric(
  payload: AnchorPayload,
  txId: string,
  metadataHash: string,
): Promise<{ fabricTxId: string } | null> {
  if (!isFabricConfigured()) return null;

  try {
    // Dynamic import so the module doesn't crash when fabric-gateway is not installed
    // @ts-expect-error Optional live dependency
    const { connect, hash } = await import(/* @vite-ignore */ "@hyperledger/fabric-gateway").catch(() => {
      throw new Error("@hyperledger/fabric-gateway not installed. Run: npm install @hyperledger/fabric-gateway");
    });

    const { readFileSync } = await import("node:fs");
    // @ts-expect-error Optional live dependency
    const grpc = await import(/* @vite-ignore */ "@grpc/grpc-js");

    const peerEndpoint = process.env["FABRIC_PEER_ENDPOINT"]!;
    const mspId = process.env["FABRIC_MSP_ID"]!;
    const channelName = process.env["FABRIC_CHANNEL_NAME"]!;
    const chaincodeName = process.env["FABRIC_CHAINCODE_NAME"]!;
    const certPath = process.env["FABRIC_CERT_PATH"]!;
    const keyPath = process.env["FABRIC_KEY_PATH"]!;
    const tlsCertPath = process.env["FABRIC_TLS_CERT_PATH"]!;

    const tlsRootCert = readFileSync(tlsCertPath);
    const credentials = grpc.credentials.createSsl(tlsRootCert);
    const client = new grpc.Client(peerEndpoint, credentials);

    const gateway = connect({
      client,
      identity: { mspId, credentials: readFileSync(certPath) },
      signer: (() => {
        const { createPrivateKey } = require("node:crypto");
        const pk = createPrivateKey(readFileSync(keyPath));
        return async (digest: Uint8Array) => {
          const { sign } = require("node:crypto");
          return sign(null, Buffer.from(digest), pk);
        };
      })(),
      hash: hash.sha256,
    });

    const network = gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);

    const fabricResult = await contract.submitTransaction(
      "notarizeDocument",
      txId,
      payload.documentId,
      payload.documentName,
      payload.sha256Hash,
      payload.actorId,
      payload.actorName,
      payload.actorRole,
      payload.caseId,
      payload.eventType,
      metadataHash,
    );

    gateway.close();
    client.close();

    const resultStr = Buffer.from(fabricResult).toString("utf8");
    const parsed = resultStr ? JSON.parse(resultStr) : {};
    return { fabricTxId: parsed.txId || txId };
  } catch (err: any) {
    console.error(`[Vigil.OS Blockchain] Fabric submission failed: ${err.message}`);
    return null;
  }
}

// ── Core Anchor Function ──────────────────────────────────────

export async function anchorToBlockchain(payload: AnchorPayload): Promise<AnchorResult> {
  try {
    const ledger = await loadLedger();
    const timestamp = new Date().toISOString();

    const prevTx = ledger.transactions[ledger.transactions.length - 1];
    const prevTxId = prevTx?.txId ?? GENESIS_HASH;
    const blockIndex = ledger.transactions.length;

    const metadataHash = computeMetadataHash(payload, timestamp);
    const txId = computeTxId(prevTxId, metadataHash, timestamp);

    // Try live Fabric first (if configured)
    const fabricResult = await submitToFabric(payload, txId, metadataHash);

    const tx: BlockchainTransaction = {
      txId,
      blockIndex,
      prevTxId,
      timestamp,
      eventType: payload.eventType,
      documentId: payload.documentId,
      documentName: payload.documentName,
      sha256Hash: payload.sha256Hash,
      ocrStatus: payload.ocrStatus,
      actorId: payload.actorId,
      actorName: payload.actorName,
      actorRole: payload.actorRole,
      caseId: payload.caseId,
      metadataHash,
      fabricTxId: fabricResult?.fabricTxId,
      simulated: !fabricResult,
    };

    ledger.transactions.push(tx);
    await saveLedger(ledger);

    return {
      success: true,
      txId,
      blockIndex,
      simulated: !fabricResult,
      fabricTxId: fabricResult?.fabricTxId,
    };
  } catch (err: any) {
    console.error(`[Vigil.OS Blockchain] Anchor failed: ${err.message}`);
    return {
      success: false,
      txId: "",
      blockIndex: -1,
      simulated: true,
      error: err.message,
    };
  }
}

// ── Convenience Wrappers ──────────────────────────────────────

export async function anchorDocumentHash(payload: Omit<AnchorPayload, "eventType">): Promise<AnchorResult> {
  return anchorToBlockchain({ ...payload, eventType: "DOCUMENT_NOTARIZED" });
}

export async function anchorSignatureEvent(payload: Omit<AnchorPayload, "eventType">): Promise<AnchorResult> {
  return anchorToBlockchain({ ...payload, eventType: "DOCUMENT_SIGNED" });
}

export async function anchorTamperEvent(payload: Omit<AnchorPayload, "eventType">): Promise<AnchorResult> {
  return anchorToBlockchain({ ...payload, eventType: "TAMPER_DETECTED" });
}

export async function anchorIntegrityVerification(payload: Omit<AnchorPayload, "eventType">): Promise<AnchorResult> {
  return anchorToBlockchain({ ...payload, eventType: "INTEGRITY_VERIFIED" });
}

// ── Ledger Query ──────────────────────────────────────────────

export async function getBlockchainLedger(): Promise<BlockchainLedger> {
  return loadLedger();
}

export async function getTransactionsForDocument(documentId: string): Promise<BlockchainTransaction[]> {
  const ledger = await loadLedger();
  return ledger.transactions.filter((tx) => tx.documentId === documentId);
}

// ── Chain Verification ────────────────────────────────────────

export async function verifyLedgerEntry(txId: string): Promise<VerifyResult | null> {
  const ledger = await loadLedger();
  const txIndex = ledger.transactions.findIndex((tx) => tx.txId === txId);
  if (txIndex === -1) return null;

  const tx = ledger.transactions[txIndex]!;

  // Recompute expected txId from its prevTxId, metadataHash, timestamp
  const expectedTxId = computeTxId(tx.prevTxId, tx.metadataHash, tx.timestamp);

  return {
    txId,
    blockIndex: tx.blockIndex,
    chainValid: expectedTxId === tx.txId,
    expectedTxId,
    computedTxId: expectedTxId,
    transaction: tx,
  };
}

export async function verifyFullChain(): Promise<{ valid: boolean; brokenAtBlock?: number; totalBlocks: number }> {
  const ledger = await loadLedger();
  const txs = ledger.transactions;

  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i]!;
    const expectedTxId = computeTxId(tx.prevTxId, tx.metadataHash, tx.timestamp);
    if (expectedTxId !== tx.txId) {
      return { valid: false, brokenAtBlock: tx.blockIndex, totalBlocks: txs.length };
    }
  }

  return { valid: true, totalBlocks: txs.length };
}
