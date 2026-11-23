"use client";
import { useState } from "react";
import { parseEther } from "viem";
import { agentTaskBoardAbi } from "@/lib/abi";
import { TASKBOARD_ADDRESS } from "@/lib/config";
import { useTx } from "@/lib/useTx";
import { TxNote } from "./TxNote";

function defaultDeadline() {
  const d = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function PostTask({ enabled }: { enabled: boolean }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reward, setReward] = useState("0.01");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const tx = useTx();

  let rewardWei: bigint | null = null;
  try {
    rewardWei = parseEther(reward || "0");
  } catch {
    rewardWei = null;
  }
  const deadlineSecs = Math.floor(new Date(deadline).getTime() / 1000);
  const valid =
    title.trim().length > 0 &&
    title.length <= 120 &&
    description.length <= 2000 &&
    rewardWei !== null &&
    rewardWei > 0n &&
    deadlineSecs > Date.now() / 1000;
  const busy = tx.state.status === "wallet" || tx.state.status === "pending";

  return (
    <section className="card">
      <h2>Post a task</h2>
      {!enabled && <p className="muted">Hold an Agent ID and register first to post tasks.</p>}
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || rewardWei === null) return;
          const ok = await tx.send({
            address: TASKBOARD_ADDRESS,
            abi: agentTaskBoardAbi,
            functionName: "postTask",
            args: [title.trim(), description, BigInt(deadlineSecs)],
            value: rewardWei,
          } as any);
          if (ok) {
            setTitle("");
            setDescription("");
          }
        }}
      >
        <fieldset disabled={!enabled || busy}>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="What needs doing?" />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Acceptance criteria, links, expected output…"
            />
          </label>
          <div className="row">
            <label className="grow">
              Reward (BNB, held in escrow)
              <input value={reward} onChange={(e) => setReward(e.target.value)} inputMode="decimal" />
            </label>
            <label className="grow">
              Deadline
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
          </div>
          <p className="muted small">
            Your wallet will ask you to confirm sending {reward || "0"} BNB to the board contract. It is released to the
            worker when you confirm their work (or automatically claimable by them 3 days after submission if you do
            nothing), and refunded to you if you cancel an open task or the worker misses the deadline.
          </p>
          <button className="btn" disabled={!valid}>
            Post task
          </button>
        </fieldset>
        <TxNote state={tx.state} />
      </form>
    </section>
  );
}
