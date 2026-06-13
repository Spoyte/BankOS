import {useState} from "react";
import type {Address} from "viem";
import {toUsdc, fromUsdc} from "@charter/shared";
import {useWallet} from "../wallet/WalletContext";
import {useAsync} from "../hooks";
import {deployment, ENABLE_LIFI} from "../config";
import {
  openCreditLine,
  allocateToStrategy,
  redeemFromStrategy,
  setPaused,
  strategyShares,
  type BankInfo,
} from "../lib/contracts";
import {getArcTreasurySwapQuote, type LifiQuote} from "../lib/lifi";
import {Money, Badge, Field, Notice, useTx, TxButton, Section} from "../components";

export function StewardPanel({bank, onChange, version}: {bank: BankInfo; onChange: () => void; version: number}) {
  return (
    <div className="grid cols-2" style={{alignItems: "start"}}>
      <div>
        <CreditDesk bank={bank} onChange={onChange} />
        <ControlsCard bank={bank} onChange={onChange} />
      </div>
      <div>
        <TreasuryDesk bank={bank} onChange={onChange} version={version} />
        {ENABLE_LIFI && <LifiCard bank={bank} />}
      </div>
    </div>
  );
}

function CreditDesk({bank, onChange}: {bank: BankInfo; onChange: () => void}) {
  const wallet = useWallet();
  const tx = useTx();
  const [member, setMember] = useState("");
  const [limit, setLimit] = useState("20000");

  async function open() {
    await tx.run(
      () => openCreditLine(wallet.walletClient!, bank.address, member.trim() as Address, toUsdc(limit || "0")),
      "Credit line opened ✓",
    );
    onChange();
  }

  return (
    <Section title="Credit lines" icon="💳">
      {!bank.products.credit && <Notice tone="info">Credit product is disabled for this bank.</Notice>}
      <Field label="Member address"><input placeholder="0x…" value={member} onChange={(e) => setMember(e.target.value)} /></Field>
      <Field label="Credit limit (USDC)" hint={`Max per borrower: ${fromUsdc(bank.risk.maxCreditPerBorrower)}`}>
        <input value={limit} onChange={(e) => setLimit(e.target.value)} />
      </Field>
      <TxButton onClick={open} className="btn primary block" pending={tx.pending} disabled={!bank.products.credit || !member}>
        Open credit line
      </TxButton>
      {tx.error && <Notice tone="err">{tx.error}</Notice>}
      {tx.ok && <Notice tone="ok">{tx.ok}</Notice>}
    </Section>
  );
}

function TreasuryDesk({bank, onChange, version}: {bank: BankInfo; onChange: () => void; version: number}) {
  const wallet = useWallet();
  const tx = useTx();
  const [amount, setAmount] = useState("50000");
  const shares = useAsync(() => strategyShares(bank.address, deployment.yieldVault), [bank.address, version]);

  async function allocate() {
    await tx.run(() => allocateToStrategy(wallet.walletClient!, bank.address, deployment.yieldVault, toUsdc(amount || "0")), "Allocated to yield ✓");
    shares.refresh();
    onChange();
  }
  async function redeem() {
    if (!shares.data) return;
    await tx.run(() => redeemFromStrategy(wallet.walletClient!, bank.address, deployment.yieldVault, shares.data!), "Redeemed from yield ✓");
    shares.refresh();
    onChange();
  }

  return (
    <Section title="Treasury yield" icon="📈" action={<Badge>guard-railed</Badge>}>
      <div className="kv"><span className="k">Idle reserve</span><span className="val"><Money v={bank.idleLiquidity} /></span></div>
      <div className="kv"><span className="k">In strategies</span><span className="val"><Money v={bank.strategyAssets} /></span></div>
      <div className="kv"><span className="k">Vault shares held</span><span className="val">{shares.data !== undefined ? fromUsdc(shares.data) : "…"}</span></div>
      <div className="hint" style={{margin: "8px 0"}}>
        Only strategies allow-listed in ExecutionRouter can be called. Vault: {deployment.yieldVault.slice(0, 10)}…
      </div>
      <div className="inline-input">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TxButton onClick={allocate} className="btn primary" pending={tx.pending} disabled={!bank.products.yield}>Allocate</TxButton>
        <TxButton onClick={redeem} className="btn" pending={tx.pending} disabled={!shares.data}>Redeem all</TxButton>
      </div>
      {tx.error && <Notice tone="err">{tx.error}</Notice>}
      {tx.ok && <Notice tone="ok">{tx.ok}</Notice>}
    </Section>
  );
}

function ControlsCard({bank, onChange}: {bank: BankInfo; onChange: () => void}) {
  const wallet = useWallet();
  const tx = useTx();
  return (
    <Section title="Controls" icon="⚙️">
      <div className="kv"><span className="k">Global deposit cap</span><span className="val">{fromUsdc(bank.risk.globalDepositCap)}</span></div>
      <div className="kv"><span className="k">Max deposit / member</span><span className="val">{fromUsdc(bank.risk.maxDepositPerMember)}</span></div>
      <div className="kv"><span className="k">Max utilization</span><span className="val">{bank.risk.maxUtilizationBps / 100}%</span></div>
      <div className="kv"><span className="k">Withdrawal delay</span><span className="val">{bank.risk.withdrawalDelay}s</span></div>
      <div className="row" style={{gap: 8, marginTop: 14}}>
        <TxButton
          onClick={() => tx.run(() => setPaused(wallet.walletClient!, bank.address, !bank.paused), bank.paused ? "Resumed ✓" : "Paused ✓").then(onChange)}
          className={bank.paused ? "btn primary" : "btn danger"}
          pending={tx.pending}
        >
          {bank.paused ? "Resume bank" : "Emergency pause"}
        </TxButton>
      </div>
      {tx.error && <Notice tone="err">{tx.error}</Notice>}
      {tx.ok && <Notice tone="ok">{tx.ok}</Notice>}
    </Section>
  );
}

function LifiCard({bank}: {bank: BankInfo}) {
  const [amount, setAmount] = useState("10000");
  const [quote, setQuote] = useState<LifiQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>();

  async function fetchQuote() {
    setLoading(true);
    setErr(undefined);
    setQuote(null);
    try {
      const q = await getArcTreasurySwapQuote({fromAddress: bank.address, amount: toUsdc(amount || "0")});
      if (!q) setErr("No route available right now.");
      setQuote(q);
    } catch (e: any) {
      setErr(e?.message ?? "quote failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="LI.FI treasury route" icon="🛣️" action={<Badge tone="amber">stretch</Badge>}>
      <p className="muted" style={{marginTop: 0}}>
        Preview an executable same-chain Arc swap (USDC→EURC). The calldata is shaped for the Unlink
        burner to rebalance idle reserve privately — this is a route preview; burner execution isn't
        wired yet (see ADR-001).
      </p>
      <div className="inline-input">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn primary" onClick={fetchQuote} disabled={loading}>{loading ? "…" : "Get route"}</button>
      </div>
      {quote && (
        <div className="card" style={{marginTop: 12, background: "var(--bg-elev)"}}>
          <div className="kv"><span className="k">Tool</span><span className="val">{quote.tool}</span></div>
          <div className="kv"><span className="k">Est. out (EURC)</span><span className="val">{fromUsdc(BigInt(quote.toAmount))}</span></div>
          <div className="kv"><span className="k">Router</span><span className="val">{quote.to.slice(0, 12)}…</span></div>
        </div>
      )}
      {err && <Notice tone="info">{err}</Notice>}
    </Section>
  );
}
