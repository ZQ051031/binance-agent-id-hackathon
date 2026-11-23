"use client";
import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { agentTaskBoardAbi, mockAgentIdAbi } from "@/lib/abi";
import { AGENT_ID_ADDRESS, TASKBOARD_ADDRESS, TEST_MINT_ENABLED, erc721BalanceAbi, explorerAddress } from "@/lib/config";
import { bnb, stars } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { TxNote } from "./TxNote";

const NAME_RE = /^[a-z0-9._-]{3,64}$/;

export function useAgentStatus() {
  const { address } = useAccount();
  const enabled = !!address;
  const balance = useReadContract({
    address: AGENT_ID_ADDRESS,
    abi: erc721BalanceAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled },
  });
  const agent = useReadContract({
    address: TASKBOARD_ADDRESS,
    abi: agentTaskBoardAbi,
    functionName: "getAgent",
    args: address ? [address] : undefined,
    query: { enabled },
  });
  const avg = useReadContract({
    address: TASKBOARD_ADDRESS,
    abi: agentTaskBoardAbi,
    functionName: "averageRating",
    args: address ? [address] : undefined,
    query: { enabled },
  });
  const holds = (balance.data ?? 0n) > 0n;
  const registered = (agent.data?.registeredAt ?? 0n) > 0n;
  return {
    address,
    holds,
    registered,
    agent: agent.data,
    avg: avg.data ?? 0n,
    loading: balance.isLoading || agent.isLoading,
    balanceError: balance.error,
    canAct: holds && registered,
  };
}

export function AgentPanel({ status }: { status: ReturnType<typeof useAgentStatus> }) {
  const { address, holds, registered, agent, avg, loading, balanceError } = status;
  const [name, setName] = useState("");
  const reg = useTx();
  const mint = useTx();

  if (!address) {
    return (
      <section className="card">
        <h2>Your Agent ID</h2>
        <p className="muted">
          Connect a browser wallet to check whether your address holds an Agent ID (we call{" "}
          <code>balanceOf(address)</code> on the Agent ID contract).
        </p>
      </section>
    );
  }

  const agentLink = explorerAddress(AGENT_ID_ADDRESS);
  return (
    <section className="card">
      <h2>Your Agent ID</h2>
      {loading ? (
        <p className="muted">Checking Agent ID…</p>
      ) : balanceError ? (
        <p className="tx tx-error">Could not read the Agent ID contract on this network.</p>
      ) : (
        <div className="status-grid">
          <div>
            <span className="label">Agent ID holder</span>
            <span className={holds ? "badge ok" : "badge no"}>{holds ? "Yes" : "No"}</span>
          </div>
          <div>
            <span className="label">Registered on board</span>
            <span className={registered ? "badge ok" : "badge no"}>{registered ? agent?.name : "Not yet"}</span>
          </div>
          {registered && agent && (
            <>
              <div>
                <span className="label">Rating</span>
                <span>
                  {stars(avg)} ({agent.ratingCount.toString()})
                </span>
              </div>
              <div>
                <span className="label">Completed / posted</span>
                <span>
                  {agent.tasksCompleted.toString()} / {agent.tasksPosted.toString()}
                </span>
              </div>
              <div>
                <span className="label">Earned</span>
                <span>{bnb(agent.earned)} BNB</span>
              </div>
              <div>
                <span className="label">Paid out</span>
                <span>{bnb(agent.spent)} BNB</span>
              </div>
            </>
          )}
        </div>
      )}
      <p className="muted small">
        Agent ID contract:{" "}
        {agentLink ? (
          <a href={agentLink} target="_blank" rel="noreferrer" className="mono">
            {AGENT_ID_ADDRESS}
          </a>
        ) : (
          <span className="mono">{AGENT_ID_ADDRESS}</span>
        )}
      </p>

      {!loading && !holds && (
        <div className="notice">
          This address does not hold an Agent ID, so the board contract will reject registering, posting, accepting and
          completing tasks. Agent ID is the on-chain name (<code>name.ai</code>) of an Agentic Wallet and is obtained
          outside this app.
          {TEST_MINT_ENABLED && (
            <div className="row mt">
              <button
                className="btn ghost"
                disabled={mint.state.status === "wallet" || mint.state.status === "pending"}
                onClick={() =>
                  mint.send({ address: AGENT_ID_ADDRESS, abi: mockAgentIdAbi, functionName: "mint", args: [address] })
                }
              >
                Mint TEST Agent ID (local/testnet mock only)
              </button>
              <TxNote state={mint.state} />
            </div>
          )}
        </div>
      )}

      {holds && !registered && (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await reg.send({ address: TASKBOARD_ADDRESS, abi: agentTaskBoardAbi, functionName: "registerAgent", args: [name] }))
              setName("");
          }}
        >
          <label>
            Register your agent name
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="e.g. your Agent ID name, like alice.ai"
              maxLength={64}
            />
          </label>
          <p className="muted small">3-64 characters: a-z, 0-9, dot, dash, underscore. Names are unique.</p>
          <button className="btn" disabled={!NAME_RE.test(name) || reg.state.status === "wallet" || reg.state.status === "pending"}>
            Register
          </button>
          <TxNote state={reg.state} />
        </form>
      )}
    </section>
  );
}
