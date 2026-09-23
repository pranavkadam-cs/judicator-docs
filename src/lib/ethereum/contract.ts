/**
 * Vigil.OS — DocumentNotary contract ABI and typed helpers
 *
 * The ABI mirrors DocumentNotary.sol exactly.
 * After deploying the contract on Remix IDE, paste the ABI here if you change it.
 */

export const DOCUMENT_NOTARY_ABI = [
  // Write
  {
    name: "notarize",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sha256Hash",   type: "bytes32" },
      { name: "documentId",   type: "string"  },
      { name: "documentName", type: "string"  },
    ],
    outputs: [],
  },
  // Read
  {
    name: "verify",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "sha256Hash", type: "bytes32" },
    ],
    outputs: [
      { name: "exists",       type: "bool"    },
      { name: "documentId",   type: "string"  },
      { name: "documentName", type: "string"  },
      { name: "notarizedBy",  type: "address" },
      { name: "timestamp",    type: "uint256" },
    ],
  },
  {
    name: "getHashByDocId",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "documentId", type: "string" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "totalNotarized",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getHashes",
    type: "function",
    stateMutability: "view",
    inputs:  [
      { name: "offset", type: "uint256" },
      { name: "limit",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32[]" }],
  },
  // Events
  {
    name: "DocumentNotarized",
    type: "event",
    inputs: [
      { name: "sha256Hash",   type: "bytes32", indexed: true  },
      { name: "documentId",   type: "string",  indexed: true  },
      { name: "documentName", type: "string",  indexed: false },
      { name: "notarizedBy",  type: "address", indexed: true  },
      { name: "timestamp",    type: "uint256", indexed: false },
    ],
  },
  // Errors
  {
    name: "AlreadyNotarized",
    type: "error",
    inputs: [{ name: "sha256Hash", type: "bytes32" }],
  },
] as const;

/** Convert a hex SHA-256 string to the bytes32 format the contract expects */
export function hexHashToBytes32(hexHash: string): `0x${string}` {
  const clean = hexHash.startsWith("0x") ? hexHash : `0x${hexHash}`;
  // Pad to 66 chars (0x + 64 hex chars = 32 bytes)
  return clean.padEnd(66, "0") as `0x${string}`;
}

/** Convert a bytes32 value back to a hex string */
export function bytes32ToHexHash(bytes32: string): string {
  return bytes32.startsWith("0x") ? bytes32.slice(2) : bytes32;
}

export { DOCUMENT_NOTARY_BYTECODE } from "./bytecode";

