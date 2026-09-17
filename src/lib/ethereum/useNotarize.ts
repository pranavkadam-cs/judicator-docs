/**
 * Vigil.OS — useNotarize hook
 * Writes a document SHA-256 hash to the Ethereum blockchain via MetaMask.
 */

import { useCallback, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { CONTRACT_ADDRESS, isConfigured } from "./config";
import { DOCUMENT_NOTARY_ABI, hexHashToBytes32 } from "./contract";

export type NotarizeStatus =
  | "idle"
  | "waiting-wallet"    // MetaMask popup is open
  | "broadcasting"      // tx submitted, waiting for confirmation
  | "confirmed"         // tx mined successfully
  | "error";

export interface NotarizeResult {
  txHash: string;
  blockNumber: number;
}

export function useNotarize() {
  const { address, isConnected } = useAccount();
  const [status, setStatus] = useState<NotarizeStatus>("idle");
  const [result, setResult] = useState<NotarizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | undefined>();

  const { writeContractAsync } = useWriteContract();

  const { data: receipt } = useWaitForTransactionReceipt({
    hash: pendingTxHash,
    query: { enabled: Boolean(pendingTxHash) },
  });

  const notarize = useCallback(
    async (params: {
      sha256Hash: string;
      documentId: string;
      documentName: string;
    }) => {
      if (!isConnected || !address) {
        setError("MetaMask wallet not connected. Please connect your wallet first.");
        return null;
      }
      if (!isConfigured) {
        setError("Ethereum not configured. Set VITE_ALCHEMY_RPC_URL and VITE_CONTRACT_ADDRESS in .env");
        return null;
      }

      setStatus("waiting-wallet");
      setError(null);
      setResult(null);

      try {
        const bytes32Hash = hexHashToBytes32(params.sha256Hash);

        // This opens the MetaMask popup for signing
        const txHash = await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: DOCUMENT_NOTARY_ABI,
          functionName: "notarize",
          args: [bytes32Hash, params.documentId, params.documentName],
        });

        setStatus("broadcasting");
        setPendingTxHash(txHash);

        return txHash;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // User rejected — friendly message
        const friendlyMsg = msg.includes("rejected") || msg.includes("denied")
          ? "Transaction was rejected in MetaMask."
          : msg.includes("AlreadyNotarized")
          ? "This document hash is already notarized on Ethereum."
          : msg;
        setError(friendlyMsg);
        setStatus("error");
        return null;
      }
    },
    [isConnected, address, writeContractAsync]
  );

  // Update status when receipt arrives
  if (receipt && status === "broadcasting") {
    setStatus("confirmed");
    setResult({
      txHash: receipt.transactionHash,
      blockNumber: Number(receipt.blockNumber),
    });
    setPendingTxHash(undefined);
  }

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
    setPendingTxHash(undefined);
  }, []);

  return {
    notarize,
    reset,
    status,
    result,
    error,
    isLoading: status === "waiting-wallet" || status === "broadcasting",
    isConfirmed: status === "confirmed",
  };
}
