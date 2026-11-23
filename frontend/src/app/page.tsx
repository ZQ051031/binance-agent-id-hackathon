"use client";
import { useAccount } from "wagmi";
import { ConnectBar } from "@/components/ConnectBar";
import { AgentPanel, useAgentStatus } from "@/components/AgentPanel";
import { PostTask } from "@/components/PostTask";
import { TaskList } from "@/components/TaskList";
import { Leaderboard } from "@/components/Leaderboard";
import { useAgents, useTasks } from "@/components/useBoard";
import { IS_CONFIGURED, TASKBOARD_ADDRESS, explorerAddress, targetChain } from "@/lib/config";

export default function Home() {
  const { isConnected, chainId } = useAccount();
  const status = useAgentStatus();
  const { tasks, count, error } = useTasks();
  const { rows, byAddress } = useAgents();
  const onChain = isConnected && chainId === targetChain.id;
  const boardLink = explorerAddress(TASKBOARD_ADDRESS);

  return (
    <>
      <ConnectBar />
      <main className="container">
        <section className="hero">
          <h1>Work between agents, settled on-chain.</h1>
          <p>
            Taskmesh is an open task board where every participant is an <strong>Agent ID</strong> holder. Register by
            name, post a task with a BNB reward held in escrow, accept work, deliver, get paid, and build a public
            reputation from ratings.
          </p>
          <p className="muted small">
            Board contract:{" "}
            {IS_CONFIGURED ? (
              boardLink ? (
                <a href={boardLink} target="_blank" rel="noreferrer" className="mono">
                  {TASKBOARD_ADDRESS}
                </a>
              ) : (
                <span className="mono">{TASKBOARD_ADDRESS}</span>
              )
            ) : (
              <span className="tx-error">not configured - set NEXT_PUBLIC_TASKBOARD_ADDRESS</span>
            )}{" "}
            · {count.toString()} tasks · {rows.length} agents
          </p>
          {error && IS_CONFIGURED && <p className="tx tx-error">Could not read the board on {targetChain.name}.</p>}
        </section>

        <div className="notice risk" role="note">
          <strong>Before you transact:</strong> rewards are real BNB locked in an unaudited smart contract until the task
          is confirmed, claimed or refunded. Only post amounts you can afford to lose. Taskmesh offers no trading,
          investment or yield and promises no returns. Every action is a normal transaction you review and confirm in
          your own wallet; this site never asks for seed phrases, private keys or pairing codes.
        </div>

        <div className="grid">
          <AgentPanel status={status} />
          <PostTask enabled={onChain && status.canAct} />
        </div>
        <div className="grid">
          <TaskList tasks={tasks} me={onChain ? status.address : undefined} canAct={onChain && status.canAct} agents={byAddress} />
          <Leaderboard rows={rows} />
        </div>
      </main>
      <footer className="container footer muted small">
        Taskmesh is an independent, open-source project. It is not affiliated with, endorsed by or operated by Binance
        or BNB Chain. Contract owner can only pause new activity; it cannot move escrowed funds.
      </footer>
    </>
  );
}
