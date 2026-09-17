const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("==================================================");
  console.log("🚀 Deploying DocumentNotary to", hre.network.name);
  console.log("==================================================");

  const signers = await hre.ethers.getSigners();
  if (!signers || signers.length === 0) {
    console.error("❌ Error: No deployer account found!");
    console.error("   Make sure SEPOLIA_PRIVATE_KEY is set in your .env file.");
    process.exit(1);
  }

  const deployer = signers[0];
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("Deployer Address :", deployer.address);
  console.log("Deployer Balance :", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n && hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.warn("⚠️ Warning: Deployer has 0 ETH! The transaction will fail without gas.");
    console.warn("   Claim free Sepolia ETH at: https://faucet.alchemy.com");
  }

  console.log("\n📦 Deploying contract DocumentNotary...");
  const DocumentNotary = await hre.ethers.getContractFactory("DocumentNotary");
  const notary = await DocumentNotary.deploy();
  await notary.waitForDeployment();

  const contractAddress = await notary.getAddress();
  console.log("✅ DocumentNotary successfully deployed to:", contractAddress);

  if (hre.network.name === "sepolia") {
    console.log("🔗 Etherscan:", `https://sepolia.etherscan.io/address/${contractAddress}`);
  }

  // Auto-update .env with the deployed contract address
  const envPath = path.resolve(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf8");
    if (/^VITE_CONTRACT_ADDRESS=.*$/m.test(envContent)) {
      envContent = envContent.replace(
        /^VITE_CONTRACT_ADDRESS=.*$/m,
        `VITE_CONTRACT_ADDRESS=${contractAddress}`
      );
    } else {
      envContent += `\nVITE_CONTRACT_ADDRESS=${contractAddress}\n`;
    }
    fs.writeFileSync(envPath, envContent, "utf8");
    console.log("📝 Updated VITE_CONTRACT_ADDRESS in .env!");
  }

  console.log("==================================================");
  console.log("✨ All set! Restart your Vite dev server to use the contract.");
  console.log("==================================================");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
