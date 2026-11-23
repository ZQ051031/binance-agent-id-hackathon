import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys AgentTaskBoard.
 *
 *   npx hardhat run scripts/deploy.ts --network bscTestnet
 *   npx hardhat run scripts/deploy.ts --network bsc
 *
 * Env:
 *   DEPLOYER_PRIVATE_KEY   key of YOUR funded deployer wallet (read from .env, never committed)
 *   AGENT_ID_ADDRESS       Agent ID contract to gate on. Default on bsc: 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
 *   OWNER_ADDRESS          owner of the board (default: deployer). Owner can only pause new activity.
 *   DEPLOY_MOCK_AGENT_ID   "true" to deploy a TEST-ONLY MockAgentID (hardhat/localhost/bscTestnet only)
 *   CONFIRM_MAINNET        must be "yes" to deploy on bsc mainnet (guards against accidents)
 */
const DEFAULT_AGENT_ID = "0x60b9262456de011f7d15a54cdd8c48baaa8b022f";
const LOCAL = ["hardhat", "localhost"];

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account. Set DEPLOYER_PRIVATE_KEY in .env");
  const name = network.name;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  if (name === "bsc" && process.env.CONFIRM_MAINNET !== "yes") {
    throw new Error("Refusing to deploy to BSC mainnet without CONFIRM_MAINNET=yes");
  }

  let agentIdAddress = process.env.AGENT_ID_ADDRESS || "";
  let mockAgentId: string | undefined;
  const wantMock = process.env.DEPLOY_MOCK_AGENT_ID === "true" || (LOCAL.includes(name) && !agentIdAddress);

  if (wantMock) {
    if (name === "bsc") throw new Error("MockAgentID must never be deployed on mainnet");
    const mock = await ethers.deployContract("MockAgentID");
    await mock.waitForDeployment();
    mockAgentId = await mock.getAddress();
    agentIdAddress = mockAgentId;
    console.log(`MockAgentID (TEST ONLY) deployed at ${mockAgentId}`);
  }
  if (!agentIdAddress) {
    if (name !== "bsc") {
      throw new Error(
        `The Agent ID contract (${DEFAULT_AGENT_ID}) is on BSC mainnet. On ${name} set AGENT_ID_ADDRESS or DEPLOY_MOCK_AGENT_ID=true`,
      );
    }
    agentIdAddress = DEFAULT_AGENT_ID;
  }

  const owner = process.env.OWNER_ADDRESS || deployer.address;
  console.log(`Network:   ${name} (chainId ${chainId})`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Owner:     ${owner}`);
  console.log(`Agent ID:  ${agentIdAddress}`);

  const board = await ethers.deployContract("AgentTaskBoard", [agentIdAddress, owner]);
  await board.waitForDeployment();
  const boardAddress = await board.getAddress();
  const tx = board.deploymentTransaction();
  console.log(`AgentTaskBoard deployed at ${boardAddress}${tx ? ` (tx ${tx.hash})` : ""}`);

  const out = {
    network: name,
    chainId,
    agentTaskBoard: boardAddress,
    agentId: agentIdAddress,
    mockAgentId: mockAgentId ?? null,
    owner,
    constructorArgs: [agentIdAddress, owner],
    deployTx: tx?.hash ?? null,
    deployedAt: new Date().toISOString(),
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(out, null, 2) + "\n");
  console.log(`Saved deployments/${name}.json`);
  if (!LOCAL.includes(name)) {
    console.log(`Next: npx hardhat run scripts/verify.ts --network ${name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
