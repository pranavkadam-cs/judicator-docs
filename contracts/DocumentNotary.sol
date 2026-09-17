// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DocumentNotary
 * @notice Vigil.OS — Immutable document hash registry on Ethereum.
 *         Anchors SHA-256 document hashes permanently on-chain.
 * @dev Deploy to Ethereum Sepolia testnet via Hardhat or Remix IDE
 *      After deployment, copy the contract address to VITE_CONTRACT_ADDRESS in .env
 */
contract DocumentNotary {
    // ─── Structs ──────────────────────────────────────────────────

    struct NotaryRecord {
        bytes32 sha256Hash;       // SHA-256 hash of the document (as bytes32)
        string  documentId;       // Vigil.OS internal document ID
        string  documentName;     // Human-readable document name
        address notarizedBy;      // Ethereum wallet address that notarized
        uint256 timestamp;        // Unix timestamp of notarization
        bool    exists;           // Guard flag — always true once set
    }

    // ─── State ────────────────────────────────────────────────────

    /// @dev sha256Hash => NotaryRecord
    mapping(bytes32 => NotaryRecord) private _records;

    /// @dev documentId => sha256Hash
    mapping(string => bytes32) private _docToHash;

    /// @dev All notarized hashes in order
    bytes32[] private _allHashes;

    address public immutable owner;

    // ─── Events ───────────────────────────────────────────────────

    event DocumentNotarized(
        bytes32 indexed sha256Hash,
        string  indexed documentId,
        string          documentName,
        address indexed notarizedBy,
        uint256         timestamp
    );

    // ─── Errors ───────────────────────────────────────────────────

    error AlreadyNotarized(bytes32 sha256Hash);

    // ─── Constructor ──────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Write Functions ──────────────────────────────────────────

    function notarize(
        bytes32 sha256Hash,
        string calldata documentId,
        string calldata documentName
    ) external {
        if (_records[sha256Hash].exists) {
            revert AlreadyNotarized(sha256Hash);
        }
        _records[sha256Hash] = NotaryRecord({
            sha256Hash:   sha256Hash,
            documentId:   documentId,
            documentName: documentName,
            notarizedBy:  msg.sender,
            timestamp:    block.timestamp,
            exists:       true
        });
        _docToHash[documentId] = sha256Hash;
        _allHashes.push(sha256Hash);
        emit DocumentNotarized(sha256Hash, documentId, documentName, msg.sender, block.timestamp);
    }

    // ─── Read Functions ───────────────────────────────────────────

    function verify(bytes32 sha256Hash)
        external
        view
        returns (bool exists, string memory documentId, string memory documentName, address notarizedBy, uint256 timestamp)
    {
        NotaryRecord storage r = _records[sha256Hash];
        return (r.exists, r.documentId, r.documentName, r.notarizedBy, r.timestamp);
    }

    function getHashByDocId(string calldata documentId) external view returns (bytes32) {
        return _docToHash[documentId];
    }

    function totalNotarized() external view returns (uint256) {
        return _allHashes.length;
    }

    function getHashes(uint256 offset, uint256 limit) external view returns (bytes32[] memory) {
        uint256 total = _allHashes.length;
        if (offset >= total) return new bytes32[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        bytes32[] memory result = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = _allHashes[i];
        }
        return result;
    }
}
