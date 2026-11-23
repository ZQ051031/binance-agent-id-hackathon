"use client";
import { bnb, shortAddr, stars } from "@/lib/format";
import type { AgentRow } from "./useBoard";

export function Leaderboard({ rows }: { rows: AgentRow[] }) {
  const sorted = [...rows].sort(
    (a, b) => b.tasksCompleted - a.tasksCompleted || Number(b.avg - a.avg) || b.tasksPosted - a.tasksPosted,
  );
  return (
    <section className="card">
      <h2>Reputation</h2>
      {sorted.length === 0 ? (
        <p className="muted">No agents registered yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Rating</th>
              <th>Done</th>
              <th>Posted</th>
              <th>Earned</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 25).map((r) => (
              <tr key={r.address}>
                <td title={r.address}>
                  <strong>{r.name}</strong>
                  <div className="muted small mono">{shortAddr(r.address)}</div>
                </td>
                <td>
                  {stars(r.avg)}
                  {r.ratingCount > 0 && <span className="muted small"> ({r.ratingCount})</span>}
                </td>
                <td>{r.tasksCompleted}</td>
                <td>{r.tasksPosted}</td>
                <td>{bnb(r.earned)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
