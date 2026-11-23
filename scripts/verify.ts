import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Verifies the deployed contracts' source on BscScan (Etherscan API v2).
 *   ETHERSCAN_API_KEY=... npx hardhat run scripts/verify.ts --network bscTestnet|bsc
 * Reads addresses and constructor arguments from deployments/<network>.json.
 */
async function verify(address: string, constructorArguments: unknown[], contract?: string) {
  try {
    await run("verify:verify", { address, constructorArguments, contract });
  } catch (e: any) {
    if (String(e?.message).toLowerCase().includes("already verified")) {
      console.log(`${address} is already verified`);
    } else {
      throw e;
    }
  }
}

async function main() {
  if (!process.env.ETHERSCAN_API_KEY) throw new Error("Set ETHERSCAN_API_KEY in .env");
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}; run scripts/deploy.ts first`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  if (d.mockAgentId) {
    await verify(d.mockAgentId, [], "contracts/mocks/MockAgentID.sol:MockAgentID");
  }
  await verify(d.agentTaskBoard, d.constructorArgs, "contracts/AgentTaskBoard.sol:AgentTaskBoard");
  console.log("Verification done");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
