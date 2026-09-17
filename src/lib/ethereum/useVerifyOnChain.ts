/**
 * Vigil.OS — useVerifyOnChain hook
 * Reads the Ethereum contract to verify whether a document hash is on-chain.
 */

import { useReadContract } from "wagmi";
import { CONTRACT_ADDRESS, isConfigured } from "./config";
import { DOCUMENT_NOTARY_ABI, hexHashToBytes32 } from "./contract";

export interface OnChainVerifyResult {
  exists: boolean;
  documentId: string;
  documentName: string;
  notarizedBy: string;
  timestamp: number;
}

/**
 * @param sha256Hash Hex string of the document SHA-256 hash, or undefined to skip
 */
export function useVerifyOnChain(sha256Hash: string | undefined) {
  const bytes32Hash = sha256Hash ? hexHashToBytes32(sha256Hash) : undefined;

  const { data, isPending, error, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: DOCUMENT_NOTARY_ABI,
    functionName: "verify",
    args: bytes32Hash ? [bytes32Hash] : undefined,
    query: {
      enabled: Boolean(sha256Hash && isConfigured),
    },
  });

  const result: OnChainVerifyResult | null =
    data && data[0]
      ? {
          exists: data[0],
          documentId: data[1],
          documentName: data[2],
          notarizedBy: data[3],
          timestamp: Number(data[4]),
        }
      : null;

  return {
    result,
    isNotarized: Boolean(result?.exists),
    isPending,
    error: error ? error.message : null,
    refetch,
  };
}

/**
 * Hook to get the total count of notarized documents from the contract.
 */
export function useTotalNotarized() {
  const { data, isPending } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: DOCUMENT_NOTARY_ABI,
    functionName: "totalNotarized",
    query: { enabled: isConfigured },
  });

  return {
    total: data ? Number(data) : 0,
    isPending,
  };
}
