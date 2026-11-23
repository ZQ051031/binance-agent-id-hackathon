import { ethers, network } from "hardhat";

/**
 * Read-only: checks whether an address holds an Agent ID (balanceOf > 0). Sends no transaction.
 *   ADDRESS=0x... npx hardhat run scripts/check-agent-id.ts --network bsc
 */
async function main() {
  const agentId = process.env.AGENT_ID_ADDRESS || "0x60b9262456de011f7d15a54cdd8c48baaa8b022f";
  const who = process.env.ADDRESS;
  if (!who) throw new Error("Set ADDRESS=0x...");
  const c = new ethers.Contract(
    agentId,
    ["function balanceOf(address) view returns (uint256)", "function name() view returns (string)"],
    ethers.provider,
  );
  const [name, bal] = await Promise.all([c.name().catch(() => "(no name())"), c.balanceOf(who)]);
  console.log(`${network.name}: ${agentId} "${name}"`);
  console.log(`${who} balanceOf = ${bal} -> ${bal > 0n ? "holds an Agent ID" : "no Agent ID"}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
