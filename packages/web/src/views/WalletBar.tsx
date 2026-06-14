import {useWallet} from "../wallet/WalletContext";
import {useAsync} from "../hooks";
import {Money, useTx} from "../components";
import {usdcBalance, mintUsdc} from "../lib/contracts";
import {toUsdc} from "@bankos/shared";

export function WalletBar() {
  const wallet = useWallet();
  const tx = useTx();
  const bal = useAsync(
    async () => (wallet.address ? usdcBalance(wallet.address) : 0n),
    [wallet.address, tx.ok],
  );

  if (!wallet.isConnected) {
    if (wallet.mode === "local") {
      return (
        <div className="wallet">
          <select
            className="select"
            defaultValue=""
            onChange={(e) => wallet.selectLocal?.(e.target.value)}
          >
            <option value="" disabled>
              Connect wallet…
            </option>
            {wallet.localAccounts?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      );
    }
    return (
      <div className="wallet">
        <button className="btn primary" onClick={() => wallet.connect()}>
          Sign in with Dynamic
        </button>
      </div>
    );
  }

  return (
    <div className="wallet">
      {wallet.mode === "local" && (
        <select className="select" value={pickId(wallet)} onChange={(e) => wallet.selectLocal?.(e.target.value)}>
          {wallet.localAccounts?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      )}
      <span className="chip">
        <span className="dot" />
        {bal.data !== undefined ? <Money v={bal.data} /> : "…"}
      </span>
      {wallet.mode === "local" && wallet.walletClient && (
        <button
          className="btn sm"
          onClick={() =>
            tx.run(() => mintUsdc(wallet.walletClient!, wallet.address!, toUsdc("100000")))
          }
          disabled={tx.pending}
        >
          {tx.pending ? "…" : "Faucet"}
        </button>
      )}
      {wallet.mode === "dynamic" && (
        <button className="btn sm" onClick={() => wallet.disconnect()}>
          {wallet.label} · Log out
        </button>
      )}
    </div>
  );
}

function pickId(wallet: ReturnType<typeof useWallet>): string {
  return wallet.localAccounts?.find((a) => a.address === wallet.address)?.id ?? "";
}
