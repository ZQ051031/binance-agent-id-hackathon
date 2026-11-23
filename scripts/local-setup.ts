import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * LOCAL DEMO ONLY (Hardhat network). Deploys a test-only MockAgentID and AgentTaskBoard to a
 * running `npx hardhat node`, mints mock Agent IDs to the first 3 Hardhat test accounts (account
 * #4 is left without one so you can see the gate), and writes frontend/.env.local.
 *
 *   npx hardhat node                      # terminal 1
 *   npm run local:setup                   # terminal 2
 */
async function main() {
  if (network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error("local-setup is for the local Hardhat network only");
  }
  const signers = await ethers.getSigners();
  const mock = await ethers.deployContract("MockAgentID");
  await mock.waitForDeployment();
  const board = await ethers.deployContract("AgentTaskBoard", [await mock.getAddress(), signers[0].address]);
  await board.waitForDeployment();

  for (const s of signers.slice(1, 4)) {
    await (await mock.mint(s.address)).wait();
  }

  const boardAddress = await board.getAddress();
  const mockAddress = await mock.getAddress();
  console.log(`MockAgentID (TEST ONLY): ${mockAddress}`);
  console.log(`AgentTaskBoard:          ${boardAddress}`);
  console.log(`Mock Agent IDs minted to Hardhat accounts #1-#3: ${signers.slice(1, 4).map((s) => s.address).join(", ")}`);
  console.log(`Hardhat account #4 (${signers[4].address}) has no Agent ID - use it to see the gate.`);

  const env =
    `NEXT_PUBLIC_CHAIN_ID=31337\n` +
    `NEXT_PUBLIC_TASKBOARD_ADDRESS=${boardAddress}\n` +
    `NEXT_PUBLIC_AGENT_ID_ADDRESS=${mockAddress}\n` +
    `NEXT_PUBLIC_LOCAL_RPC_URL=http://127.0.0.1:8545\n` +
    `NEXT_PUBLIC_ENABLE_TEST_MINT=true\n`;
  fs.writeFileSync(path.join(__dirname, "..", "frontend", ".env.local"), env);
  fs.mkdirSync(path.join(__dirname, "..", "deployments"), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, "..", "deployments", "localhost.json"),
    JSON.stringify({ network: "localhost", chainId: 31337, agentTaskBoard: boardAddress, agentId: mockAddress }, null, 2) +
      "\n",
  );
  console.log("Wrote frontend/.env.local");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
