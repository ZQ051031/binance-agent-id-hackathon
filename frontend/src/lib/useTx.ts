"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient, useWriteContract } from "wagmi";
import { errorMessage } from "./format";

export type TxState = { status: "idle" | "wallet" | "pending" | "success" | "error"; hash?: string; error?: string };

/** Sends a contract write. The wallet always shows its own confirmation prompt; nothing is auto-signed. */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();
  const qc = useQueryClient();
  const [state, setState] = useState<TxState>({ status: "idle" });

  async function send(args: Parameters<typeof writeContractAsync>[0]) {
    try {
      setState({ status: "wallet" });
      const hash = await writeContractAsync(args);
      setState({ status: "pending", hash });
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      setState({ status: "success", hash });
      await qc.invalidateQueries();
      return true;
    } catch (e) {
      setState({ status: "error", error: errorMessage(e) });
      return false;
    }
  }

  return { state, send, reset: () => setState({ status: "idle" }) };
}
