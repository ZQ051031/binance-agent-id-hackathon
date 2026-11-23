import { http, createConfig } from "wagmi";
import { bsc, bscTestnet, hardhat } from "wagmi/chains";
import { injected } from "wagmi";
import type { Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337);
export const TASKBOARD_ADDRESS = (process.env.NEXT_PUBLIC_TASKBOARD_ADDRESS || ZERO) as Address;
export const AGENT_ID_ADDRESS = (process.env.NEXT_PUBLIC_AGENT_ID_ADDRESS ||
  "0x60b9262456de011f7d15a54cdd8c48baaa8b022f") as Address;
export const IS_CONFIGURED = TASKBOARD_ADDRESS.toLowerCase() !== ZERO;
export const TEST_MINT_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_TEST_MINT === "true" && (CHAIN_ID === 31337 || CHAIN_ID === 97);

const localRpc = process.env.NEXT_PUBLIC_LOCAL_RPC_URL || "http://127.0.0.1:8545";
const customRpc = process.env.NEXT_PUBLIC_RPC_URL || undefined;

const localChain = { ...hardhat, rpcUrls: { default: { http: [localRpc] } } } as const;
const allChains = [localChain, bscTestnet, bsc] as const;
export const targetChain = allChains.find((c) => c.id === CHAIN_ID) ?? localChain;

export const explorerTx = (hash: string) =>
  targetChain.blockExplorers?.default ? `${targetChain.blockExplorers.default.url}/tx/${hash}` : undefined;
export const explorerAddress = (addr: string) =>
  targetChain.blockExplorers?.default ? `${targetChain.blockExplorers.default.url}/address/${addr}` : undefined;

// Browser-extension (injected) wallets only: every transaction is confirmed by the user in their wallet.
export const wagmiConfig = createConfig({
  chains: [targetChain],
  connectors: [injected()],
  transports: { [targetChain.id]: http(targetChain.id === CHAIN_ID ? customRpc : undefined) } as any,
  ssr: true,
});

export const erc721BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
