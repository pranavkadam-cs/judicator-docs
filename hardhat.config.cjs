require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const SEPOLIA_RPC_URL =
  process.env.VITE_ALCHEMY_RPC_URL ||
  (process.env.VITE_ALCHEMY_API_KEY
    ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.VITE_ALCHEMY_API_KEY}`
    : "https://eth-sepolia.g.alchemy.com/v2/alch_LNlcOt3tW2qjATVThzJLI");

const PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;
const accounts = PRIVATE_KEY && PRIVATE_KEY.length >= 64 ? [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: accounts,
    },
  },
};
