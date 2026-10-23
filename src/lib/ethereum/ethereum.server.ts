/* ─────────────────────────────────────────────────────────────
 *  Vigil.OS — Server-Side Ethereum Sepolia Integration
 *  Direct JSON-RPC calls via Alchemy / Ethers
 * ───────────────────────────────────────────────────────────── */

import { ethers } from "ethers";
import { hexHashToBytes32, DOCUMENT_NOTARY_ABI } from "./contract";

function getRpcUrl(): string {
  return (
    process.env["VITE_ALCHEMY_RPC_URL"] ||
    (process.env["VITE_ALCHEMY_API_KEY"]
      ? `https://eth-sepolia.g.alchemy.com/v2/${process.env["VITE_ALCHEMY_API_KEY"]}`
      : "https://ethereum-sepolia-rpc.publicnode.com")
  );
}

function getContractAddress(): string {
  return (
    process.env["VITE_CONTRACT_ADDRESS"] ||
    "0x8F8be67eBFC758d4423fd51c9281fc410493D348"
  );
}

function getPrivateKey(): string | undefined {
  const pk = process.env["SEPOLIA_PRIVATE_KEY"]?.trim();
  if (!pk || pk.length < 64) return undefined;
  return pk.startsWith("0x") ? pk : `0x${pk}`;
}

function createProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(getRpcUrl(), 11155111, { staticNetwork: true });
}

export interface SepoliaVerifyResult {
  configured: boolean;
  contractAddress: string;
  sha256Hash: string;
  exists: boolean;
  documentId?: string;
  documentName?: string;
  notarizedBy?: string;
  timestamp?: number;
  timestampFormatted?: string;
  etherscanAddressUrl: string;
  network: string;
  chainId: number;
}

export async function verifyDocumentOnChainServer(
  sha256Hash: string
): Promise<SepoliaVerifyResult> {
  const contractAddress = getContractAddress();
  const etherscanAddressUrl = `https://sepolia.etherscan.io/address/${contractAddress}`;

  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    return {
      configured: false,
      contractAddress: "",
      sha256Hash,
      exists: false,
      etherscanAddressUrl,
      network: "sepolia",
      chainId: 11155111,
    };
  }

  try {
    const provider = createProvider();
    const contract = new ethers.Contract(
      contractAddress,
      DOCUMENT_NOTARY_ABI,
      provider
    );

    const bytes32Hash = hexHashToBytes32(sha256Hash);
    const [exists, documentId, documentName, notarizedBy, timestampBig] =
      await contract.verify(bytes32Hash);

    const timestampNum = Number(timestampBig);

    return {
      configured: true,
      contractAddress,
      sha256Hash,
      exists: Boolean(exists),
      documentId: exists ? documentId : undefined,
      documentName: exists ? documentName : undefined,
      notarizedBy: exists ? notarizedBy : undefined,
      timestamp: exists ? timestampNum : undefined,
      timestampFormatted: exists && timestampNum > 0
        ? new Date(timestampNum * 1000).toUTCString()
        : undefined,
      etherscanAddressUrl,
      network: "sepolia",
      chainId: 11155111,
    };
  } catch (err: any) {
    console.error("[Ethereum.server] Error verifying hash on chain:", err);
    return {
      configured: true,
      contractAddress,
      sha256Hash,
      exists: false,
      etherscanAddressUrl,
      network: "sepolia",
      chainId: 11155111,
    };
  }
}

export async function notarizeDocumentOnChainServer(params: {
  sha256Hash: string;
  documentId: string;
  documentName: string;
}): Promise<{
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  etherscanTxUrl?: string;
  error?: string;
}> {
  const privateKey = getPrivateKey();
  if (!privateKey) {
    return {
      success: false,
      error: "SEPOLIA_PRIVATE_KEY is not configured in .env for server-side notarization.",
    };
  }

  const contractAddress = getContractAddress();

  try {
    const provider = createProvider();
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(
      contractAddress,
      DOCUMENT_NOTARY_ABI,
      wallet
    );

    const bytes32Hash = hexHashToBytes32(params.sha256Hash);

    // First check if already notarized
    const [exists] = await contract.verify(bytes32Hash);
    if (exists) {
      return {
        success: false,
        error: "This document hash is already permanently notarized on Sepolia.",
      };
    }

    const tx = await contract.notarize(
      bytes32Hash,
      params.documentId,
      params.documentName
    );

    const receipt = await tx.wait(1); // wait for 1 confirmation

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      etherscanTxUrl: `https://sepolia.etherscan.io/tx/${receipt.hash}`,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("AlreadyNotarized")) {
      return {
        success: false,
        error: "This document hash is already notarized on Sepolia.",
      };
    }
    return {
      success: false,
      error: msg,
    };
  }
}

export async function getSepoliaChainStatusServer(): Promise<{
  configured: boolean;
  contractAddress: string;
  deployerAddress?: string;
  deployerBalanceEth?: string;
  totalNotarized: number;
  network: string;
  chainId: number;
  rpcUrl: string;
}> {
  const contractAddress = getContractAddress();
  const rpcUrl = getRpcUrl();
  const privateKey = getPrivateKey();

  let deployerAddress: string | undefined;
  let deployerBalanceEth: string | undefined;
  let totalNotarized = 0;

  try {
    const provider = createProvider();
    const contract = new ethers.Contract(
      contractAddress,
      DOCUMENT_NOTARY_ABI,
      provider
    );

    if (privateKey) {
      const wallet = new ethers.Wallet(privateKey, provider);
      deployerAddress = wallet.address;
      const bal = await provider.getBalance(wallet.address);
      deployerBalanceEth = ethers.formatEther(bal);
    }

    const total = await contract.totalNotarized();
    totalNotarized = Number(total);
  } catch (err) {
    console.error("[Ethereum.server] Error getting chain status:", err);
  }

  return {
    configured: Boolean(contractAddress),
    contractAddress,
    deployerAddress,
    deployerBalanceEth,
    totalNotarized,
    network: "sepolia",
    chainId: 11155111,
    rpcUrl: rpcUrl.replace(/alch_[a-zA-Z0-9]+/, "alch_••••••••"),
  };
}
