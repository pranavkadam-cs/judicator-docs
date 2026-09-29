const hre = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("==================================================");
  console.log("🔍 TESTING ETHEREUM SEPOLIA BLOCKCHAIN INTEGRATION");
  console.log("==================================================");

  // 1. Check Provider & Network
  const provider = hre.ethers.provider;
  console.log("1. Checking RPC Connection...");
  const network = await provider.getNetwork();
  const blockNumber = await provider.getBlockNumber();
  console.log(`   Network Name: ${network.name}`);
  console.log(`   Chain ID: ${network.chainId.toString()}`);
  console.log(`   Latest Block Number: ${blockNumber}`);

  if (Number(network.chainId) !== 11155111) {
    console.warn(`   ⚠️ Warning: Connected chain ID is ${network.chainId}, expected 11155111 (Sepolia)!`);
  } else {
    console.log("   ✅ Connected to Ethereum Sepolia successfully!");
  }

  // 2. Check Signer / Deployer
  console.log("\n2. Checking Wallet & Signer...");
  const signers = await hre.ethers.getSigners();
  if (!signers || signers.length === 0) {
    console.error("   ❌ No signer configured! Please set SEPOLIA_PRIVATE_KEY in .env");
    return;
  }
  const signer = signers[0];
  const balance = await provider.getBalance(signer.address);
  const formattedBalance = hre.ethers.formatEther(balance);
  console.log(`   Signer Address: ${signer.address}`);
  console.log(`   Sepolia ETH Balance: ${formattedBalance} ETH`);

  if (balance === 0n) {
    console.warn("   ⚠️ Warning: Wallet has 0 Sepolia ETH. Cannot submit write transactions.");
    console.warn("   Claim testnet ETH from https://cloud.google.com/application/web3/faucet/ethereum/sepolia or https://sepoliafaucet.com");
  } else {
    console.log("   ✅ Wallet has funds for gas fees!");
  }

  // 3. Check Contract Address
  console.log("\n3. Checking DocumentNotary Contract...");
  const contractAddress = process.env.VITE_CONTRACT_ADDRESS;
  console.log(`   Configured Address: ${contractAddress || "None"}`);

  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000" || !hre.ethers.isAddress(contractAddress)) {
    console.log("   ⚠️ Contract address is missing or invalid in .env.");
    console.log("   You can deploy it using: npm run contract:deploy:sepolia");
    return;
  }

  const code = await provider.getCode(contractAddress);
  if (!code || code === "0x") {
    console.error(`   ❌ No contract bytecode found at ${contractAddress} on Sepolia!`);
    console.error("   The address may be on a different network or not yet deployed.");
    return;
  }
  console.log(`   ✅ Contract found on-chain at: https://sepolia.etherscan.io/address/${contractAddress}`);

  // 4. Contract Read Operations
  console.log("\n4. Testing Contract Read Methods...");
  const DocumentNotary = await hre.ethers.getContractFactory("DocumentNotary");
  const notary = DocumentNotary.attach(contractAddress).connect(signer);

  try {
    const total = await notary.totalNotarized();
    console.log(`   Total Documents Notarized: ${total.toString()}`);
    const owner = await notary.owner();
    console.log(`   Contract Owner: ${owner}`);

    if (total > 0n) {
      const hashes = await notary.getHashes(0, Math.min(Number(total), 3));
      console.log(`   Sample on-chain hashes (up to 3):`);
      for (const h of hashes) {
        const record = await notary.verify(h);
        console.log(`     - Hash: ${h}`);
        console.log(`       Doc ID: ${record[1]}`);
        console.log(`       Doc Name: ${record[2]}`);
        console.log(`       Notarized By: ${record[3]}`);
        console.log(`       Timestamp: ${new Date(Number(record[4]) * 1000).toISOString()}`);
      }
    }
  } catch (err) {
    console.error("   ❌ Failed to read contract state:", err.message);
    return;
  }

  // 5. Test Write Transaction (Notarize a test document)
  if (balance > 0n) {
    console.log("\n5. Testing Write Transaction (Notarizing a test hash on Sepolia)...");
    const testDocId = `test-doc-${Date.now()}`;
    const testDocName = `Diagnostic_Test_${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
    const randomBytes = hre.ethers.randomBytes(32);
    const testHash = hre.ethers.hexlify(randomBytes);

    console.log(`   Sending notarize transaction:`);
    console.log(`     Doc ID: ${testDocId}`);
    console.log(`     Name: ${testDocName}`);
    console.log(`     SHA-256: ${testHash}`);

    try {
      const tx = await notary.notarize(testHash, testDocId, testDocName);
      console.log(`   ⏳ Transaction sent! TX Hash: ${tx.hash}`);
      console.log(`   🔗 View on Etherscan: https://sepolia.etherscan.io/tx/${tx.hash}`);
      console.log(`   Waiting for block confirmation...`);

      const receipt = await tx.wait(1);
      console.log(`   ✅ Transaction Confirmed in Block #${receipt.blockNumber}!`);
      console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
      console.log(`   Effective Gas Price: ${hre.ethers.formatUnits(receipt.gasPrice || 0n, "gwei")} Gwei`);

      // 6. Verification
      console.log("\n6. Verifying Recorded Document On-Chain...");
      const record = await notary.verify(testHash);
      if (record[0] === true) {
        console.log("   🎉 VERIFICATION SUCCESSFUL!");
        console.log(`     Exists: ${record[0]}`);
        console.log(`     Document ID: ${record[1]}`);
        console.log(`     Document Name: ${record[2]}`);
        console.log(`     Notarized By: ${record[3]}`);
        console.log(`     Timestamp: ${new Date(Number(record[4]) * 1000).toLocaleString()}`);
      } else {
        console.error("   ❌ Verification check returned exists = false!");
      }
    } catch (err) {
      console.error("   ❌ Transaction execution failed:", err.message || err);
    }
  } else {
    console.log("\n5. Skipping Write Transaction test because balance is 0 ETH.");
  }

  console.log("\n==================================================");
  console.log("🏁 Blockchain Diagnostic Completed.");
  console.log("==================================================");
}

main().catch((error) => {
  console.error("Diagnostic error:", error);
  process.exitCode = 1;
});
