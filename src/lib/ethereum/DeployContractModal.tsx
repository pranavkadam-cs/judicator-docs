import { useState } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { updateContractAddressFn } from "@/lib/dms.functions";
import { DOCUMENT_NOTARY_ABI, DOCUMENT_NOTARY_BYTECODE } from "./contract";
import { etherscanTx, etherscanAddress, ETH_NETWORK } from "./config";
import { WalletButton } from "./WalletButton";
import { Rocket, Loader2, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";

export function DeployContractButton({
  onDeployed,
  className,
}: {
  onDeployed?: (address: string) => void;
  className?: string;
}) {
  const { isConnected } = useAccount();
  const [deploying, setDeploying] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);

  const updateContract = useServerFn(updateContractAddressFn);

  async function handleDeploy() {
    const eth = typeof window !== "undefined" ? (window as any).ethereum : undefined;
    if (!eth) {
      toast.error("MetaMask not detected", { description: "Please install the MetaMask browser extension." });
      return;
    }

    setDeploying(true);
    setTxHash(null);
    setDeployedAddress(null);

    try {
      toast.info("Awaiting MetaMask approval…", {
        description: "Please confirm the deployment transaction in your MetaMask wallet.",
      });

      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();

      const factory = new ethers.ContractFactory(
        DOCUMENT_NOTARY_ABI,
        DOCUMENT_NOTARY_BYTECODE,
        signer
      );

      const contract = await factory.deploy();
      const deploymentTx = contract.deploymentTransaction();
      if (deploymentTx?.hash) {
        setTxHash(deploymentTx.hash);
        toast.info("Deploying to Ethereum…", {
          description: `Transaction broadcast: ${deploymentTx.hash.slice(0, 16)}…`,
        });
      }

      await contract.waitForDeployment();
      const address = await contract.getAddress();
      setDeployedAddress(address);

      // Save to .env on server
      await updateContract({ data: { address } });

      toast.success("DocumentNotary Deployed Successfully!", {
        description: `Contract address: ${address.slice(0, 14)}…`,
      });

      if (onDeployed) {
        onDeployed(address);
      }
    } catch (err: any) {
      console.error("Contract deployment error:", err);
      const msg = err?.reason || err?.message || "Deployment failed";
      toast.error("Deployment failed", { description: msg });
    } finally {
      setDeploying(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-2 p-3 text-center">
        <p className="text-xs text-muted-foreground">
          Connect your MetaMask wallet to deploy the smart contract to {ETH_NETWORK === "sepolia" ? "Sepolia" : "Mainnet"}.
        </p>
        <WalletButton />
      </div>
    );
  }

  if (deployedAddress) {
    return (
      <div className="rounded-sm border border-green-500/30 bg-green-500/10 p-3 space-y-2 text-xs">
        <div className="flex items-center gap-2 font-mono font-bold text-green-400 uppercase tracking-wider">
          <CheckCircle2 className="size-4 text-green-400" />
          Smart Contract Active on Ethereum
        </div>
        <div className="space-y-1 font-mono text-[11px]">
          <div>
            Contract:{" "}
            <a
              href={etherscanAddress(deployedAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              {deployedAddress} <ExternalLink className="size-2.5" />
            </a>
          </div>
          {txHash && (
            <div>
              Tx Hash:{" "}
              <a
                href={etherscanTx(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                {txHash.slice(0, 24)}… <ExternalLink className="size-2.5" />
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => void handleDeploy()}
        disabled={deploying}
        className={
          className ||
          "inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 cursor-pointer disabled:opacity-50"
        }
      >
        {deploying ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Deploying DocumentNotary.sol…
          </>
        ) : (
          <>
            <Rocket className="size-3.5" />
            Deploy Smart Contract with MetaMask
          </>
        )}
      </button>

      {deploying && txHash && (
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
          <Loader2 className="size-3 animate-spin text-primary" />
          <span>Mining transaction on Sepolia… </span>
          <a
            href={etherscanTx(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            View on Etherscan <ExternalLink className="size-2.5" />
          </a>
        </div>
      )}
    </div>
  );
}
