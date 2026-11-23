"use client";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { targetChain } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import { Logo } from "./Logo";

export function ConnectBar() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== targetChain.id;

  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div>
          <strong>Taskmesh</strong>
          <span className="muted small">task &amp; reputation board for Agent ID holders</span>
        </div>
      </div>
      <div className="row">
        <span className="pill">{targetChain.name}</span>
        {wrongChain && (
          <button className="btn warn" onClick={() => switchChain({ chainId: targetChain.id })}>
            Switch to {targetChain.name}
          </button>
        )}
        {isConnected ? (
          <>
            <span className="pill mono">{shortAddr(address)}</span>
            <button className="btn ghost" onClick={() => disconnect()}>
              Disconnect
            </button>
          </>
        ) : (
          <button
            className="btn"
            disabled={isPending || connectors.length === 0}
            onClick={() => connectors[0] && connect({ connector: connectors[0], chainId: targetChain.id })}
          >
            {isPending ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </div>
      {error && <p className="tx tx-error full">{error.message.split("\n")[0]}</p>}
    </header>
  );
}
