import type { TxState } from "@/lib/useTx";
import { explorerTx } from "@/lib/config";

export function TxNote({ state }: { state: TxState }) {
  if (state.status === "idle") return null;
  const link = state.hash ? explorerTx(state.hash) : undefined;
  const text = {
    wallet: "Confirm the transaction in your wallet…",
    pending: "Transaction sent, waiting for confirmation…",
    success: "Confirmed.",
    error: state.error,
  }[state.status];
  return (
    <p className={`tx tx-${state.status}`} role="status">
      {text}{" "}
      {state.hash &&
        (link ? (
          <a href={link} target="_blank" rel="noreferrer">
            view tx
          </a>
        ) : (
          <code>{state.hash.slice(0, 12)}…</code>
        ))}
    </p>
  );
}
