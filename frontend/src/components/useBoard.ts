"use client";
import { useReadContract, useReadContracts } from "wagmi";
import { agentTaskBoardAbi } from "@/lib/abi";
import { TASKBOARD_ADDRESS } from "@/lib/config";

const board = { address: TASKBOARD_ADDRESS, abi: agentTaskBoardAbi } as const;
const PAGE = 200n;

export function useTasks() {
  const count = useReadContract({ ...board, functionName: "taskCount" });
  const n = count.data ?? 0n;
  const offset = n > PAGE ? n - PAGE : 0n;
  const tasks = useReadContract({ ...board, functionName: "getTasks", args: [offset, PAGE], query: { enabled: n > 0n } });
  return {
    tasks: [...(tasks.data ?? [])].reverse(),
    count: n,
    loading: count.isLoading || tasks.isLoading,
    error: count.error || tasks.error,
  };
}

export type AgentRow = {
  address: `0x${string}`;
  name: string;
  avg: bigint;
  ratingCount: number;
  tasksCompleted: number;
  tasksPosted: number;
  earned: bigint;
  spent: bigint;
};

export function useAgents() {
  const list = useReadContract({ ...board, functionName: "getAgents", args: [0n, 500n] });
  const addrs = list.data ?? [];
  const details = useReadContracts({
    contracts: addrs.flatMap((a) => [
      { ...board, functionName: "getAgent", args: [a] } as const,
      { ...board, functionName: "averageRating", args: [a] } as const,
    ]),
    query: { enabled: addrs.length > 0 },
  });
  const rows: AgentRow[] = addrs.map((address, i) => {
    const a = details.data?.[2 * i]?.result as
      | { name: string; ratingCount: number; tasksCompleted: number; tasksPosted: number; earned: bigint; spent: bigint }
      | undefined;
    const avg = (details.data?.[2 * i + 1]?.result as bigint | undefined) ?? 0n;
    return {
      address,
      name: a?.name ?? "",
      avg,
      ratingCount: Number(a?.ratingCount ?? 0),
      tasksCompleted: Number(a?.tasksCompleted ?? 0),
      tasksPosted: Number(a?.tasksPosted ?? 0),
      earned: a?.earned ?? 0n,
      spent: a?.spent ?? 0n,
    };
  });
  const byAddress = new Map(rows.map((r) => [r.address.toLowerCase(), r]));
  return { rows, byAddress, loading: list.isLoading };
}
