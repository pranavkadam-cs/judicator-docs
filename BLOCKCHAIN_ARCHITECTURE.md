# SIH Problem Statement 26190: Dual-Layer Blockchain Notarization Architecture

## Executive Overview

**Vigil.OS** implements a **Dual-Layer Blockchain Notarization System** designed to provide immutable, cryptographically verifiable proof-of-existence and chain-of-custody for all digital evidence, legal documents, and forensic records managed by the platform.

The system satisfies **SIH Problem Statement 26190** requirements for tamper-proof audit trails by anchoring SHA-256 document hashes across two complementary blockchain layers:

1. **Layer 1 — Public Ethereum Smart Contract**: Permanent on-chain anchoring via a Solidity smart contract (`DocumentNotary.sol`) deployed on Ethereum Sepolia Testnet / Mainnet, integrated with MetaMask and Alchemy RPC.
2. **Layer 2 — Local Cryptographic Chained Ledger**: A server-side SHA-256 chained block ledger (`blockchain.server.ts`) providing instant, zero-gas forensic audit capabilities with cryptographic block linkage and tamper detection.

---

## 1. Dual-Layer Architecture Overview

```
                              ┌──────────────────────────────────────────────┐
                              │        Vigil.OS Client (Browser)             │
                              │   React 19 + TailwindCSS + Wagmi v2 + Viem  │
                              └──────────────────┬───────────────────────────┘
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        │                                                 │
                        ▼                                                 ▼
       ┌────────────────────────────────┐            ┌────────────────────────────────┐
       │   LAYER 1: PUBLIC ETHEREUM     │            │   LAYER 2: LOCAL CHAINED       │
       │   SMART CONTRACT NOTARY        │            │   CRYPTOGRAPHIC LEDGER         │
       │                                │            │                                │
       │   Contract: DocumentNotary.sol │            │   Engine: blockchain.server.ts  │
       │   Network: Sepolia / Mainnet   │            │   Store:  blockchain-ledger.json│
       │   RPC:     Alchemy JSON-RPC    │            │   Hash:   SHA-256 Block Links   │
       │   Wallet:  MetaMask (injected) │            │   Verify: Constant-time Compare │
       │   Tooling: Wagmi v2 + Viem     │            │   Audit:  Full Chain Validation │
       │                                │            │                                │
       │   ✓ Immutable Public Record    │            │   ✓ Zero-Gas Instant Logging   │
       │   ✓ Global Verifiability       │            │   ✓ Offline-Capable Audit      │
       │   ✓ Etherscan Deep-Links       │            │   ✓ Genesis Block Anchoring    │
       │   ✓ Wallet-Signed Provenance   │            │   ✓ Chain Continuity Checks    │
       └────────────────────────────────┘            └────────────────────────────────┘
```

---

## 2. Layer 1 — Ethereum Smart Contract (`DocumentNotary.sol`)

### 2.1 Smart Contract Design

The `DocumentNotary.sol` contract (Solidity `^0.8.20`) implements an immutable document hash registry on the Ethereum Virtual Machine (EVM):

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DocumentNotary {
    struct NotaryRecord {
        bytes32 sha256Hash;       // SHA-256 hash of document (as bytes32)
        string  documentId;       // Vigil.OS internal document ID
        string  documentName;     // Human-readable document name
        address notarizedBy;      // Ethereum wallet address that notarized
        uint256 timestamp;        // Immutable block timestamp
        bool    exists;           // Anti-overwrite guard
    }

    mapping(bytes32 => NotaryRecord) private _records;   // sha256Hash => record
    mapping(string => bytes32)       private _docToHash;  // documentId => sha256Hash
    bytes32[]                        private _allHashes;   // ordered notarization log
    address public immutable owner;
}
```

### 2.2 Contract Functions

| Function | Type | Parameters | Description |
| :--- | :---: | :--- | :--- |
| `notarize()` | Write | `sha256Hash`, `documentId`, `documentName` | Permanently anchors a document hash on-chain. Reverts with `AlreadyNotarized` if hash exists. |
| `verify()` | Read | `sha256Hash` | Returns full `NotaryRecord` (exists, docId, docName, signer wallet, timestamp). |
| `getHashByDocId()` | Read | `documentId` | Reverse lookup: returns the `bytes32` hash registered under a Vigil.OS document ID. |
| `totalNotarized()` | Read | — | Returns the total count of notarized documents on-chain. |
| `getHashes()` | Read | `offset`, `limit` | Paginated retrieval of all notarized hashes for auditing and batch verification. |

### 2.3 Event Emission

Every successful notarization emits a Solidity event, enabling real-time indexing and Etherscan deep-link verification:

```solidity
event DocumentNotarized(
    bytes32 indexed sha256Hash,
    string  indexed documentId,
    string          documentName,
    address indexed notarizedBy,
    uint256         timestamp
);
```

### 2.4 Security Properties

| Property | Implementation |
| :--- | :--- |
| **Anti-Overwrite** | `AlreadyNotarized` custom error prevents duplicate hash anchoring |
| **Immutability** | No `delete` or `update` functions — records are permanent once written |
| **Provenance** | `msg.sender` (MetaMask wallet address) is permanently recorded |
| **Timestamping** | `block.timestamp` provides a miner-validated Unix timestamp |
| **Owner Tracking** | `immutable owner` records the deployer address |

---

## 3. Web3 Integration Stack

### 3.1 Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Vigil.OS Frontend                               │
│                                                                          │
│  WalletButton.tsx ──── useAccount / useConnect / useDisconnect (Wagmi)    │
│        │                                                                 │
│        ▼                                                                 │
│  NotarizeButton.tsx ── useNotarize.ts ── useWriteContract (Wagmi)         │
│        │                    │                                            │
│        │                    └── useWaitForTransactionReceipt              │
│        │                                                                 │
│  VerifyOnChain ─────── useVerifyOnChain.ts ── useReadContract (Wagmi)    │
│        │                                                                 │
│  DeployContractModal ── In-browser deployment with bytecode              │
│                                                                          │
│  config.ts ──── Wagmi createConfig + Alchemy HTTP Transport              │
│  contract.ts ── ABI Definition + hexHashToBytes32 Converter              │
│  bytecode.ts ── Compiled contract bytecode for in-browser deploy         │
└──────────────────────┬───────────────────────────────────────────────────┘
                       │  JSON-RPC via Alchemy
                       ▼
              ┌────────────────────┐
              │  Alchemy RPC Node  │
              │  eth-sepolia /     │
              │  eth-mainnet       │
              └────────┬───────────┘
                       │
                       ▼
              ┌────────────────────┐
              │  Ethereum Network  │
              │  DocumentNotary    │
              │  Smart Contract    │
              └────────────────────┘
```

### 3.2 Technology Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Wallet Connector** | Wagmi v2 + `metaMask()` + `injected()` connectors | MetaMask popup for signing transactions |
| **Ethereum Client** | Viem (underlying Wagmi transport) | Type-safe Ethereum interaction |
| **RPC Infrastructure** | Alchemy JSON-RPC | High-throughput Ethereum node access |
| **Chain Configuration** | Wagmi `createConfig` with `http()` transport | Sepolia testnet / Ethereum mainnet |
| **ABI Encoding** | `DOCUMENT_NOTARY_ABI` (contract.ts) | Type-safe contract function calls |
| **Hash Conversion** | `hexHashToBytes32()` / `bytes32ToHexHash()` | SHA-256 hex ↔ Solidity `bytes32` |

### 3.3 Key React Hooks

#### `useNotarize()` — Write Hook
Manages the full on-chain notarization lifecycle:

```
idle → waiting-wallet → broadcasting → confirmed
                                    ↘ error
```

- Opens MetaMask popup via `writeContractAsync`
- Tracks transaction hash with `useWaitForTransactionReceipt`
- Provides friendly error messages for rejected/duplicate transactions

#### `useVerifyOnChain()` — Read Hook
Queries the smart contract to verify whether a document hash exists on-chain:
- Returns `NotaryRecord` data (exists, documentId, signer, timestamp)
- Auto-enabled only when Ethereum is configured

#### `useTotalNotarized()` — Counter Hook
Reads the total count of all on-chain notarized documents from `totalNotarized()`.

### 3.4 Environment Variables

```env
VITE_ALCHEMY_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/{YOUR_API_KEY}
VITE_ALCHEMY_API_KEY={YOUR_API_KEY}
VITE_ETH_NETWORK=sepolia          # sepolia | mainnet
VITE_CHAIN_ID=11155111             # 11155111 (Sepolia) | 1 (Mainnet)
VITE_CONTRACT_ADDRESS=0x...        # Deployed DocumentNotary contract address
SEPOLIA_PRIVATE_KEY=...            # Deployer wallet private key (CLI deploy only)
```

---

## 4. Layer 2 — Local SHA-256 Chained Cryptographic Ledger

### 4.1 Architecture

The local ledger (`src/lib/blockchain.server.ts`) implements a blockchain-inspired chained audit log where each block's transaction ID is cryptographically derived from the previous block, creating an unbreakable chain of custody.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Blockchain Ledger Engine                          │
│                       blockchain.server.ts                              │
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│  │  GENESIS     │────▶│  BLOCK #0   │────▶│  BLOCK #1   │────▶ ...     │
│  │  0000...0000 │     │  txId = H₀  │     │  txId = H₁  │              │
│  └─────────────┘     │  prevTxId =  │     │  prevTxId =  │              │
│                       │    GENESIS   │     │    H₀        │              │
│                       │  metaHash   │     │  metaHash    │              │
│                       │  timestamp  │     │  timestamp   │              │
│                       └─────────────┘     └─────────────┘               │
│                                                                         │
│  Chain Link Formula:                                                    │
│    txId = SHA-256( prevTxId : metadataHash : timestamp )                │
│    metadataHash = SHA-256( canonical JSON of event metadata )           │
│                                                                         │
│  Storage: .data/blockchain-ledger.json                                  │
│  Verification: Constant-time (crypto.timingSafeEqual)                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Block Structure

Each block in the ledger contains the following fields:

```typescript
type BlockchainTransaction = {
  txId: string;           // SHA-256(prevTxId:metadataHash:timestamp) — chain link
  blockIndex: number;     // Sequential block number (0-based)
  prevTxId: string;       // Hash of previous transaction (GENESIS for block 0)
  timestamp: string;      // ISO 8601 timestamp
  eventType: BlockchainEventType;  // DOCUMENT_NOTARIZED | DOCUMENT_SIGNED | ...
  documentId: string;     // Vigil.OS internal document ID
  documentName: string;   // Human-readable document name
  sha256Hash: string;     // Authoritative SHA-256 digest of document bytes
  actorId: string;        // User who performed the action
  actorName: string;      // Display name of the actor
  actorRole: string;      // ADMIN | INVESTIGATOR | LEGAL | COURT | VIEWER
  caseId: string;         // Associated case dossier ID
  metadataHash: string;   // SHA-256 of canonical event metadata
  simulated: boolean;     // Whether this is a simulated (local) block
};
```

### 4.3 Event Types

| Event Type | Description | Trigger |
| :--- | :--- | :--- |
| `DOCUMENT_NOTARIZED` | Document SHA-256 hash anchored to the ledger | File upload / registration |
| `DOCUMENT_SIGNED` | Digital signature applied to a sealed document | Signature workflow action |
| `TAMPER_DETECTED` | Physical file bytes failed integrity re-hash | Download gate / integrity check |
| `INTEGRITY_VERIFIED` | Document successfully passed integrity verification | Download gate / manual check |

### 4.4 Cryptographic Chain Link Algorithm

Every new block's `txId` is deterministically computed from three inputs, creating an unbreakable cryptographic chain:

```
Step 1: Compute metadata hash
  metadataHash = SHA-256(JSON.stringify({
    eventType,
    documentId,
    sha256Hash,    // document's authoritative hash
    actorId,
    caseId,
    timestamp
  }))

Step 2: Compute transaction ID (chain link)
  txId = SHA-256( prevTxId + ":" + metadataHash + ":" + timestamp )

Step 3: Chain continuity enforcement
  block[N].prevTxId === block[N-1].txId   (for N > 0)
  block[0].prevTxId === GENESIS_HASH      (all zeros)
```

### 4.5 Security Features

| Feature | Implementation | Protection |
| :--- | :--- | :--- |
| **Constant-Time Comparison** | `crypto.timingSafeEqual()` | Prevents side-channel timing attacks during hash verification |
| **SHA-256 Hash Validation** | Strict regex `/^[a-fA-F0-9]{64}$/` | Rejects malformed or injected hash values |
| **Input Sanitization** | `sanitizeString()` strips control chars | Prevents injection of non-printable or escape characters |
| **Atomic File I/O** | Memory-cache fallback on read failure | Resilient against disk I/O race conditions |
| **Genesis Anchoring** | Hardcoded `0x00…00` (64 zeros) | Deterministic starting point for chain validation |
| **Chain Continuity** | `prevTxId` linkage + full-chain audit | Any single tampered block breaks the entire chain |

---

## 5. Ledger I/O & Storage

### 5.1 Ledger File Format

The ledger is persisted as a JSON file at `.data/blockchain-ledger.json`:

```json
{
  "genesisHash": "0000000000000000000000000000000000000000000000000000000000000000",
  "chainId": "vigil-os-document-notary-v1",
  "transactions": [
    {
      "txId": "a1b2c3...",
      "blockIndex": 0,
      "prevTxId": "0000...0000",
      "timestamp": "2026-08-28T14:30:00.000Z",
      "eventType": "DOCUMENT_NOTARIZED",
      "documentId": "doc-001",
      "documentName": "FIR Report #291",
      "sha256Hash": "e3b0c442...",
      "actorId": "usr-invest-002",
      "actorName": "Insp. A. Deshmukh",
      "actorRole": "INVESTIGATOR",
      "caseId": "MH-2026-CR-0891",
      "metadataHash": "f4d5e6...",
      "simulated": true
    }
  ],
  "lastUpdatedAt": "2026-08-28T14:30:00.000Z"
}
```

### 5.2 Resilience Strategy

```
                        ┌─────────────────────┐
                        │   loadLedger()       │
                        └──────────┬──────────┘
                                   │
                        ┌──────────▼──────────┐
                   ┌────│ File exists on disk? │────┐
                   │    └─────────────────────┘    │
                  YES                              NO
                   │                                │
            ┌──────▼──────┐               ┌────────▼────────┐
            │ Parse JSON  │               │ Create Genesis   │
            │ from disk   │               │ Block & Write    │
            └──────┬──────┘               └────────┬────────┘
                   │                                │
           ┌──────▼──────┐                         │
      ┌────│ Parse OK?   │────┐                    │
      │    └─────────────┘    │                    │
     YES                     NO                    │
      │                       │                    │
      ▼                 ┌─────▼────────┐           │
  Return               │ In-Memory    │           │
  Parsed               │ Cache Exists?│           │
  Ledger               └──────┬───────┘           │
                         YES  │  NO                │
                          │   │                    │
                          ▼   ▼                    │
                    Return  Return                 │
                    Cache   Empty                  │
                            Fallback               │
```

---

## 6. Chain Verification Engine

### 6.1 Single Block Verification (`verifyLedgerEntry`)

Verifies a single transaction's cryptographic authenticity in three steps:

1. **Recompute Expected txId**: `SHA-256(prevTxId:metadataHash:timestamp)`
2. **Chain Continuity Check**: `block[N-1].txId === block[N].prevTxId`
3. **Constant-Time Comparison**: `crypto.timingSafeEqual(expected, actual)`

Returns a `VerifyResult` with `chainValid: true | false`.

### 6.2 Full Chain Audit (`verifyFullChain`)

Audits every single block in the ledger sequentially from genesis:

```
FOR each block[i] in ledger:
  1. Verify block[i].prevTxId === block[i-1].txId  (or GENESIS if i=0)
  2. Recompute expected txId from block data
  3. Constant-time compare expected vs stored txId
  4. IF mismatch → return { valid: false, brokenAtBlock: i }

IF all blocks pass → return { valid: true, totalBlocks: N }
```

This provides the `/blockchain` page with a real-time **Chain of Custody: Cryptographically Intact** status indicator.

---

## 7. API Server Functions

The blockchain subsystem exposes the following RPC endpoints via `src/lib/dms.functions.ts`:

| Function | Method | Description | Security |
| :--- | :---: | :--- | :--- |
| `getBlockchainLedgerFn` | GET | Retrieves the complete local SHA-256 block ledger, including all transactions, genesis hash, and chain status | Authenticated session |
| `verifyBlockchainEntryFn` | POST | Audits a specific block's cryptographic chain integrity and detects broken links | Authenticated session |

### Convenience Anchor Functions (Internal API)

These functions are called internally by the DMS engine when documents are processed:

| Function | Event Type | Trigger |
| :--- | :--- | :--- |
| `anchorDocumentHash()` | `DOCUMENT_NOTARIZED` | File upload / registration |
| `anchorSignatureEvent()` | `DOCUMENT_SIGNED` | Digital signature applied |
| `anchorTamperEvent()` | `TAMPER_DETECTED` | Integrity check failure |
| `anchorIntegrityVerification()` | `INTEGRITY_VERIFIED` | Successful integrity verification |

---

## 8. Repository File Map

```
judicator-docs/
├── contracts/
│   └── DocumentNotary.sol               # Solidity ^0.8.20 smart contract
├── scripts/
│   └── deploy.cjs                       # Hardhat automated deployment script
├── src/lib/
│   ├── blockchain.server.ts             # Local SHA-256 chained block ledger engine
│   └── ethereum/
│       ├── config.ts                    # Wagmi / Viem / Alchemy chain configuration
│       ├── contract.ts                  # Contract ABI & hex↔bytes32 converters
│       ├── bytecode.ts                  # Compiled contract bytecode for in-browser deploy
│       ├── NotarizeButton.tsx           # One-click on-chain notarization UI
│       ├── WalletButton.tsx             # MetaMask connect / disconnect button
│       ├── DeployContractModal.tsx       # In-browser contract deployment modal
│       ├── useNotarize.ts               # Wagmi write hook (notarize mutation)
│       └── useVerifyOnChain.ts          # Wagmi read hook (on-chain verification)
├── src/routes/
│   └── blockchain.tsx                   # Blockchain Ledger & Ethereum Notary UI page
├── .data/
│   └── blockchain-ledger.json           # Persistent local SHA-256 block ledger
└── hardhat.config.cjs                   # Hardhat Solidity compilation configuration
```

---

## 9. Deployment Instructions

### 9.1 Compile the Smart Contract

```bash
npm run contract:compile
```
Uses Hardhat to compile `contracts/DocumentNotary.sol` with Solidity `0.8.20`.

### 9.2 Deploy to Ethereum Sepolia Testnet

1. Add your deployer wallet private key to `.env`:
   ```env
   SEPOLIA_PRIVATE_KEY=your_metamask_private_key_here
   ```
2. Ensure your wallet has Sepolia ETH (claim free ETH at [faucet.alchemy.com](https://faucet.alchemy.com)).
3. Deploy:
   ```bash
   npm run contract:deploy:sepolia
   ```
4. The script automatically:
   - Deploys the contract to Sepolia
   - Prints the transaction hash and Etherscan link
   - Writes `VITE_CONTRACT_ADDRESS` to `.env`

### 9.3 Deploy to Local Test Network

```bash
npm run contract:deploy:local
```
Deploys against a Hardhat in-memory node for instant local testing.

### 9.4 In-Browser Deployment

Vigil.OS includes an **in-browser contract deployment** modal (`DeployContractModal.tsx`) that:
- Uses the pre-compiled bytecode bundled in `bytecode.ts`
- Deploys directly from MetaMask without requiring Hardhat CLI
- Automatically updates the frontend contract address

### 9.5 Deploy via Remix IDE (Alternative)

1. Open [remix.ethereum.org](https://remix.ethereum.org).
2. Paste the contents of `contracts/DocumentNotary.sol`.
3. Compile with Solidity `0.8.20`.
4. Under **Deploy & Run Transactions**, select **Injected Provider - MetaMask**.
5. Deploy to Sepolia and paste the deployed address into `VITE_CONTRACT_ADDRESS` in `.env`.

---

## 10. Live Hackathon Demo Instructions (For SIH Judges)

### Step 1: Observe the Blockchain Ledger Page

1. Navigate to **`/blockchain`** from the sidebar.
2. Observe the **Chain of Custody** status banner:
   - 🟢 **Green Shield**: Chain integrity is cryptographically intact.
   - 🔴 **Red Shield**: Chain has been compromised (tampered block detected).
3. View key stats: **Sealed Blocks**, **Notarized Docs**, **Digital Signatures**, **Ethereum Contract**.

### Step 2: Upload a Document & Verify Local Blockchain Anchoring

1. Switch to **Insp. A. Deshmukh (Investigator)** in the personnel bar.
2. Open a Case Dossier (e.g., `MH-2026-CR-0891`).
3. Upload a document via the **Secure Intake Form**.
4. Return to **`/blockchain`** → observe a new block appeared in the **Immutable Audit Ledger** table.
5. Click **Verify** on the new block → toast confirms **Chain Valid ✅**.

### Step 3: Demonstrate Ethereum Smart Contract Notarization

1. Ensure MetaMask is installed and connected to **Sepolia Testnet**.
2. Click **Connect MetaMask** in the top-right of the blockchain page.
3. Open any document detail page (`/documents/{docId}`).
4. Click **Notarize on Ethereum** → MetaMask popup appears.
5. Confirm the transaction → observe:
   - Status: `waiting-wallet → broadcasting → confirmed`
   - Toast with Etherscan link appears.
6. Click the **Etherscan** link → view the permanent on-chain record.
7. Return to `/blockchain` → the **On-Chain Document Seals** counter increments.

### Step 4: Demonstrate Chain Tamper Detection

1. Upload a document and note the block in the ledger.
2. On the document detail page, click **Simulate Tampering (Demo)**.
3. Return to **`/blockchain`** → a new `TAMPER_DETECTED` block appears (red badge).
4. Click **Verify** on any block → observe the chain verification result.
5. If the tampered block broke the chain, the status banner changes to **🔴 Security Warning: Chain Broken**.

### Step 5: Verify On-Chain Record

1. On the document detail page, the **On-Chain — Ethereum Verified** badge displays:
   - Notarized by: `0x1234...abcd` (wallet address)
   - Timestamp: miner-validated block timestamp
2. Click **View on Etherscan** → independently verify the record on a public block explorer.

---

## 11. Enterprise Readiness — Hyperledger Fabric

The local chained ledger is architecturally designed as a drop-in bridge to enterprise blockchain platforms:

```
                    ┌───────────────────────────────────────┐
                    │      Vigil.OS Blockchain Engine        │
                    │      blockchain.server.ts              │
                    │                                        │
                    │  anchorToBlockchain(payload)           │
                    │         │                              │
                    │    ┌────┴─────────────────────┐       │
                    │    │                           │       │
                    │    ▼                           ▼       │
                    │  LOCAL LEDGER            FABRIC PEER   │
                    │  (Current)              (Future)       │
                    │  .data/blockchain-      gRPC / REST    │
                    │  ledger.json            connection     │
                    └───────────────────────────────────────┘
```

Environment variables for Hyperledger Fabric integration are already defined:

```env
FABRIC_PEER_ENDPOINT=       # Hyperledger Fabric peer gRPC endpoint
FABRIC_MSP_ID=              # Membership Service Provider ID
FABRIC_CHANNEL_NAME=        # Fabric channel name
FABRIC_CHAINCODE_NAME=      # Deployed chaincode (DocumentNotaryCC)
```

When Fabric credentials are configured, the `anchorToBlockchain()` function will simultaneously write to both the local ledger and the Fabric peer, providing dual-layer enterprise-grade tamper-proof audit trails.
