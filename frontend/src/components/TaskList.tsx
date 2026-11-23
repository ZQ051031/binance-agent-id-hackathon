"use client";
import { useState } from "react";
import { zeroAddress } from "viem";
import { agentTaskBoardAbi } from "@/lib/abi";
import { TASKBOARD_ADDRESS } from "@/lib/config";
import { STATUS, bnb, fmtTime, shortAddr } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { TxNote } from "./TxNote";
import type { AgentRow } from "./useBoard";

const REVIEW_PERIOD = 3 * 24 * 3600;

type Task = {
  id: bigint;
  poster: `0x${string}`;
  worker: `0x${string}`;
  reward: bigint;
  createdAt: bigint;
  deadline: bigint;
  submittedAt: bigint;
  status: number;
  revisions: number;
  posterRated: boolean;
  workerRated: boolean;
  title: string;
  description: string;
  result: string;
};

type Props = {
  tasks: readonly Task[];
  me?: `0x${string}`;
  canAct: boolean;
  agents: Map<string, AgentRow>;
};

const FILTERS = ["All", "Open", "Mine", "Completed"] as const;

export function TaskList({ tasks, me, canAct, agents }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const mine = (t: Task) => !!me && (eq(t.poster, me) || eq(t.worker, me));
  const shown = tasks.filter((t) =>
    filter === "All" ? true : filter === "Open" ? t.status === 0 : filter === "Mine" ? mine(t) : t.status === 3,
  );
  return (
    <section className="card wide">
      <div className="row between">
        <h2>Tasks</h2>
        <div className="tabs" role="tablist">
          {FILTERS.map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "tab active" : "tab"} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="muted">No tasks here yet.</p>
      ) : (
        <ul className="tasks">
          {shown.map((t) => (
            <TaskCard key={t.id.toString()} task={t} me={me} canAct={canAct} agents={agents} />
          ))}
        </ul>
      )}
    </section>
  );
}

const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function Who({ addr, agents }: { addr: string; agents: Map<string, AgentRow> }) {
  const a = agents.get(addr.toLowerCase());
  return (
    <span title={addr}>
      <strong>{a?.name || shortAddr(addr)}</strong>
    </span>
  );
}

function TaskCard({ task: t, me, canAct, agents }: { task: Task; me?: `0x${string}`; canAct: boolean; agents: Map<string, AgentRow> }) {
  const tx = useTx();
  const [result, setResult] = useState("");
  const [note, setNote] = useState("");
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState("");
  const now = Date.now() / 1000;
  const isPoster = eq(t.poster, me);
  const isWorker = t.worker !== zeroAddress && eq(t.worker, me);
  const busy = tx.state.status === "wallet" || tx.state.status === "pending";
  const status = STATUS[t.status];
  const reviewEnds = Number(t.submittedAt) + REVIEW_PERIOD;
  const pastDeadline = now > Number(t.deadline);
  const call = (functionName: string, args: readonly unknown[]) =>
    tx.send({ address: TASKBOARD_ADDRESS, abi: agentTaskBoardAbi, functionName, args } as any);

  return (
    <li className="task">
      <div className="row between">
        <div>
          <span className={`status s-${status.toLowerCase()}`}>{status}</span>{" "}
          <span className="muted small">#{t.id.toString()}</span>
          <h3>{t.title}</h3>
        </div>
        <div className="reward">{bnb(t.reward)} BNB</div>
      </div>
      {t.description && <p className="desc">{t.description}</p>}
      <p className="muted small">
        Posted by <Who addr={t.poster} agents={agents} />
        {t.worker !== zeroAddress && (
          <>
            {" "}
            · worker <Who addr={t.worker} agents={agents} />
          </>
        )}{" "}
        · deadline {fmtTime(t.deadline)}
        {t.revisions > 0 && <> · revisions {t.revisions}</>}
      </p>
      {t.result && (
        <p className="result">
          <span className="label">Result</span> {t.result}
        </p>
      )}

      {me && (
        <div className="actions">
          {t.status === 0 && !isPoster && (
            <button className="btn" disabled={!canAct || busy || pastDeadline} onClick={() => call("acceptTask", [t.id])}>
              {pastDeadline ? "Deadline passed" : "Accept task"}
            </button>
          )}
          {t.status === 0 && isPoster && (
            <button className="btn ghost" disabled={busy} onClick={() => call("cancelTask", [t.id])}>
              Cancel &amp; refund
            </button>
          )}

          {t.status === 1 && isWorker && (
            <>
              <input
                className="grow"
                value={result}
                onChange={(e) => setResult(e.target.value)}
                maxLength={500}
                placeholder="Result: link, IPFS CID, hash or short text"
              />
              <button
                className="btn"
                disabled={!canAct || busy || !result.trim() || pastDeadline}
                onClick={() => call("completeTask", [t.id, result.trim()])}
              >
                Mark completed
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => call("withdrawFromTask", [t.id])}>
                Withdraw
              </button>
            </>
          )}
          {t.status === 1 && isPoster && (
            <button className="btn ghost" disabled={busy || !pastDeadline} onClick={() => call("cancelTask", [t.id])}>
              {pastDeadline ? "Worker missed deadline: cancel & refund" : "In progress"}
            </button>
          )}

          {t.status === 2 && isPoster && (
            <>
              <button className="btn" disabled={busy} onClick={() => call("confirmCompletion", [t.id])}>
                Confirm &amp; release {bnb(t.reward)} BNB
              </button>
              {now < reviewEnds && t.revisions < 2 && (
                <>
                  <input className="grow" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="Revision note" />
                  <button className="btn ghost" disabled={busy} onClick={() => call("requestRevision", [t.id, note])}>
                    Request revision
                  </button>
                </>
              )}
            </>
          )}
          {t.status === 2 && isWorker && (
            <button className="btn" disabled={busy || now < reviewEnds} onClick={() => call("claimPayment", [t.id])}>
              {now < reviewEnds ? `Awaiting review (claimable ${fmtTime(reviewEnds)})` : "Claim payment"}
            </button>
          )}

          {t.status === 3 && ((isPoster && !t.posterRated) || (isWorker && !t.workerRated)) && (
            <>
              <span className="small">Rate the {isPoster ? "worker" : "poster"}:</span>
              <select value={score} onChange={(e) => setScore(Number(e.target.value))} aria-label="score">
                {[5, 4, 3, 2, 1].map((s) => (
                  <option key={s} value={s}>
                    {s} ★
                  </option>
                ))}
              </select>
              <input className="grow" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={280} placeholder="Comment (optional)" />
              <button className="btn" disabled={busy || !canAct} onClick={() => call("rateTask", [t.id, score, comment])}>
                Submit rating
              </button>
            </>
          )}
        </div>
      )}
      <TxNote state={tx.state} />
    </li>
  );
}
