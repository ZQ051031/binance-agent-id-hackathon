import { formatEther } from "viem";

export const STATUS = ["Open", "Accepted", "Submitted", "Completed", "Cancelled"] as const;

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const bnb = (wei: bigint) => {
  const s = formatEther(wei);
  const [i, d = ""] = s.split(".");
  return d ? `${i}.${d.slice(0, 6).replace(/0+$/, "")}`.replace(/\.$/, "") : i;
};
export const fmtTime = (secs: bigint | number) => new Date(Number(secs) * 1000).toLocaleString();
export const stars = (avgX100: bigint) =>
  avgX100 === 0n ? "unrated" : `${(Number(avgX100) / 100).toFixed(2)} / 5`;

export function errorMessage(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; cause?: { data?: { errorName?: string } } };
  const name = err?.cause?.data?.errorName;
  if (name) return `Reverted: ${name}`;
  const msg = err?.shortMessage || err?.message || String(e);
  return msg.split("\n")[0];
}
