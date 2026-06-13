import {useState} from "react";
import type {Address} from "viem";
import {toUsdc, fromUsdc, type Products} from "@charter/shared";
import {useWallet} from "../wallet/WalletContext";
import {useAsync} from "../hooks";
import {deployment, ENABLE_LIFI} from "../config";
import {
  openCreditLine,
  allocateToStrategy,
  redeemFromStrategy,
  setPaused,
  configureProducts,
  strategyShares,
  getPolicy,
  harvestYield,
  setStewardSpread,
  claimStewardFees,
  stewardFees,
  stewardSpreadBps,
  type BankInfo,
} from "../lib/contracts";
import {getBankMembers} from "../lib/events";
import {getArcTreasurySwapQuote, type LifiQuote} from "../lib/lifi";
import {proposeTreasuryMove, fetchClaudeReview} from "../lib/treasuryAgent";
import {useLedger} from "../ledger/LedgerProvider";
import {clearSign} from "../ledger/erc7730";
import {Money, Badge, Field, Notice, Toggle, useTx, TxButton, Section} from "../components";

export function StewardPanel({bank, onChange, version}: {bank: BankInfo; onChange: () => void; version: number}) {
  return (
    <div className="grid cols-2" style={{alignItems: "start"}}>
      <div>
        <CreditDesk bank={bank} onChange={onChange} />
        <MemberRoster bank={bank} version={version} />
        <ControlsCard bank={bank} onChange={onChange} />
      </div>
      <div>
        <TreasuryAgentCard bank={bank} onChange={onChange} />
        <TreasuryDesk bank={bank} onChange={onChange} version={version} />
        {ENABLE_LIFI && <LifiCard bank={bank} />}
      </div>
    </div>
  );
}

function TreasuryAgentCard({bank, onChange}: {bank: BankInfo; onChange: () => void}) {
  const wallet = useWallet();
  const ledger = useLedger();
  const tx = useTx();
  const proposal = proposeTreasuryMove(bank);
  const review = useAsync(() => fetchClaudeReview(bank, proposal), [bank.address, proposal.action, proposal.amount.toString()]);
  const rationale = review.data?.rationale ?? proposal.rationale;
  const risk = review.data?.risk ?? proposal.risk;
  const toneByRisk = {low: "green", medium: "amber", high: "red"} as const;

  async function execute() {
    if (proposal.action === "hold") return;
    await tx.run(async () => {
      if (proposal.action === "allocate") {
        await ledger.requestApproval(clearSign.allocate(bank.address, deployment.yieldVault, proposal.amount));
        await allocateToStrategy(wallet.walletClient!, bank.address, deployment.yieldVault, proposal.amount);
      } else {
        const sharesHeld = await strategyShares(bank.address, deployment.yieldVault);
        const shares = bank.strategyAssets > 0n ? (sharesHeld * proposal.amount) / bank.strategyAssets : sharesHeld;
        await ledger.requestApproval(clearSign.redeem(bank.address, deployment.yieldVault, shares, proposal.amount));
        await redeemFromStrategy(wallet.walletClient!, bank.address, deployment.yieldVault, shares);
      }
    }, "Agent move approved & executed ✓");
    onChange();
  }

  return (
    <Section title="Treasury agent" icon="🤖" action={<Badge tone="brand">{review.data ? "Claude + Ledger" : "AI + Ledger"}</Badge>}>
      <div className="agent-headline">
        <div className="agent-avatar">◆</div>
        <div style={{flex: 1}}>
          <strong>{proposal.headline}</strong>
          <div className="row wrap" style={{gap: 6, marginTop: 4}}>
            <Badge tone={toneByRisk[risk]}>{risk} risk</Badge>
            {review.data && <Badge tone={review.data.concur ? "green" : "amber"}>Claude {review.data.concur ? "concurs" : "flags"}</Badge>}
            {proposal.requiresLedger && <Badge tone="brand">Ledger approval required</Badge>}
            {proposal.action !== "hold" && <Badge>{proposal.action} · {fromUsdc(proposal.amount)} USDC</Badge>}
          </div>
        </div>
      </div>

      <div className="agent-reasoning">
        {rationale.map((r, i) => (
          <div className="agent-thought" key={i}>
            <span className="agent-bullet">›</span> {r}
          </div>
        ))}
        {review.data?.note && <div className="hint" style={{marginTop: 6}}>Claude: {review.data.note}</div>}
      </div>

      {proposal.action !== "hold" && (
        <>
          <div className="kv"><span className="k">Idle after</span><span className="val">{fromUsdc(proposal.projected.idleAfter)} USDC</span></div>
          <div className="kv"><span className="k">Deployed after</span><span className="val">{fromUsdc(proposal.projected.deployedAfter)} USDC</span></div>
          <TxButton onClick={execute} className="btn primary block" pending={tx.pending} disabled={!bank.products.yield}>
            {proposal.requiresLedger || ledger.enabled ? "✦ Approve on Ledger & execute" : "Execute agent move"}
          </TxButton>
          <div className="hint">The agent proposes; you approve on-device. Nothing moves without your signature.</div>
        </>
      )}
      {tx.error && <Notice tone="err">{tx.error}</Notice>}
      {tx.ok && <Notice tone="ok">{tx.ok}</Notice>}
    </Section>
  );
}

function MemberRoster({bank, version}: {bank: BankInfo; version: number}) {
  const roster = useAsync(async () => {
    const members = await getBankMembers(bank.address);
    return Promise.all(
      members.map(async (m) => ({...m, policy: await getPolicy(bank.address, m.address)})),
    );
  }, [bank.address, version]);

  return (
    <Section title="Members" icon="👥">
      {roster.loading && <div className="muted">Loading…</div>}
      {roster.data && roster.data.length === 0 && (
        <div className="muted">No members have registered a private account yet.</div>
      )}
      {roster.data?.map((m) => {
        const eligible = m.policy.canDeposit && (m.policy.expiry === 0 || m.policy.expiry * 1000 > Date.now());
        return (
          <div className="kv" key={m.address}>
            <span className="k mono" style={{cursor: "copy"}} title={m.address} onClick={() => navigator.clipboard?.writeText(m.address)}>
              {m.address.slice(0, 8)}…{m.address.slice(-4)} 📋
            </span>
            <span className="val">
              {eligible ? <Badge tone="green">tier {m.policy.tier}</Badge> : <Badge tone="amber">no policy</Badge>}
              {m.policy.canBorrow && <Badge tone="brand">credit</Badge>}
            </span>
          </div>
        );
      })}
      <div className="hint" style={{marginTop: 8}}>Click an address to copy it into the credit form.</div>
    </Section>
  );
}

function CreditDesk({bank, onChange}: {bank: BankInfo; onChange: () => void}) {
  const wallet = useWallet();
  const tx = useTx();
  const ledger = useLedger();
  const [member, setMember] = useState("");
  const [limit, setLimit] = useState("20000");

  async function open() {
    await tx.run(async () => {
      const m = member.trim() as Address;
      const lim = toUsdc(limit || "0");
      await ledger.requestApproval(clearSign.openCredit(bank.address, m, lim));
      await openCreditLine(wallet.walletClient!, bank.address, m, lim);
    }, "Credit line opened ✓");
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
  const ledger = useLedger();
  const [amount, setAmount] = useState("50000");
  const [spread, setSpread] = useState("");
  const shares = useAsync(() => strategyShares(bank.address, deployment.yieldVault), [bank.address, version, tx.ok]);
  const fees = useAsync(() => stewardFees(bank.address), [bank.address, version, tx.ok]);
  const spreadBps = useAsync(() => stewardSpreadBps(bank.address), [bank.address, version, tx.ok]);

  async function allocate() {
    await tx.run(async () => {
      const amt = toUsdc(amount || "0");
      await ledger.requestApproval(clearSign.allocate(bank.address, deployment.yieldVault, amt));
      await allocateToStrategy(wallet.walletClient!, bank.address, deployment.yieldVault, amt);
    }, "Allocated to yield ✓");
    shares.refresh();
    onChange();
  }
  async function redeem() {
    if (!shares.data) return;
    await tx.run(() => redeemFromStrategy(wallet.walletClient!, bank.address, deployment.yieldVault, shares.data!), "Redeemed from yield ✓");
    shares.refresh();
    onChange();
  }
  async function harvest() {
    await tx.run(() => harvestYield(wallet.walletClient!, bank.address, deployment.yieldVault), "Yield harvested → distributed to depositors ✓");
    onChange();
  }
  async function saveSpread() {
    await tx.run(() => setStewardSpread(wallet.walletClient!, bank.address, Math.round(Number(spread) * 100)), "Spread updated ✓");
  }
  async function claimFees() {
    await tx.run(() => claimStewardFees(wallet.walletClient!, bank.address), "Fees claimed ✓");
    onChange();
  }

  return (
    <Section title="Treasury yield" icon="📈" action={<Badge>guard-railed</Badge>}>
      <div className="kv"><span className="k">Idle reserve</span><span className="val"><Money v={bank.idleLiquidity} /></span></div>
      <div className="kv"><span className="k">In strategies</span><span className="val"><Money v={bank.strategyAssets} /></span></div>
      <div className="kv"><span className="k">Vault shares held</span><span className="val">{shares.data !== undefined ? fromUsdc(shares.data) : "…"}</span></div>
      <div className="inline-input" style={{marginTop: 8}}>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TxButton onClick={allocate} className="btn primary" pending={tx.pending} disabled={!bank.products.yield}>Allocate</TxButton>
        <TxButton onClick={redeem} className="btn" pending={tx.pending} disabled={!shares.data}>Redeem all</TxButton>
      </div>

      <div className="sep" />
      <div className="lbl muted" style={{fontSize: 13}}>Yield-bearing deposits</div>
      <div className="kv"><span className="k">Steward spread</span><span className="val">{spreadBps.data !== undefined ? `${spreadBps.data / 100}%` : "…"}</span></div>
      <div className="kv"><span className="k">Your accrued fees</span><span className="val">{fees.data !== undefined ? <Money v={fees.data} /> : "…"}</span></div>
      <div className="inline-input" style={{marginTop: 8}}>
        <input placeholder="spread %" value={spread} onChange={(e) => setSpread(e.target.value)} />
        <TxButton onClick={saveSpread} className="btn" pending={tx.pending} disabled={!spread}>Set spread</TxButton>
      </div>
      <div className="row" style={{gap: 8, marginTop: 8}}>
        <TxButton onClick={harvest} className="btn primary" pending={tx.pending} disabled={!shares.data}>Harvest → depositors</TxButton>
        <TxButton onClick={claimFees} className="btn" pending={tx.pending} disabled={!fees.data}>Claim fees</TxButton>
      </div>
      <div className="hint" style={{marginTop: 6}}>
        Harvest skims only the yield (principal stays deployed), takes your spread, and distributes the rest pro-rata to depositors.
      </div>
      {tx.error && <Notice tone="err">{tx.error}</Notice>}
      {tx.ok && <Notice tone="ok">{tx.ok}</Notice>}
    </Section>
  );
}

function ControlsCard({bank, onChange}: {bank: BankInfo; onChange: () => void}) {
  const wallet = useWallet();
  const tx = useTx();
  const ledger = useLedger();
  const [products, setProducts] = useState<Products>(bank.products);
  const dirty = products.checking !== bank.products.checking || products.yield !== bank.products.yield || products.credit !== bank.products.credit;

  return (
    <Section title="Controls" icon="⚙️">
      <div className="row between" style={{marginBottom: 6}}>
        <Toggle on={ledger.enabled} onChange={ledger.setEnabled} label="Ledger-secured steward" />
        <Badge tone={ledger.enabled ? "green" : "default"}>{ledger.enabled ? "device required" : "off"}</Badge>
      </div>
      <div className="hint" style={{marginBottom: 12}}>
        When on, high-risk actions (credit, treasury, pause) require Clear-Signing approval on a Ledger device.
      </div>
      <div className="sep" />
      <div className="lbl muted" style={{fontSize: 13, marginBottom: 4}}>Products</div>
      <Toggle on={products.checking} onChange={(v) => setProducts({...products, checking: v})} label="Private checking" />
      <Toggle on={products.yield} onChange={(v) => setProducts({...products, yield: v})} label="Treasury yield" />
      <Toggle on={products.credit} onChange={(v) => setProducts({...products, credit: v})} label="Credit lines" />
      {dirty && (
        <TxButton
          onClick={() => tx.run(() => configureProducts(wallet.walletClient!, bank.address, products), "Products updated ✓").then(onChange)}
          className="btn primary sm"
          pending={tx.pending}
        >
          Save products
        </TxButton>
      )}
      <div className="sep" />
      <div className="kv"><span className="k">Global deposit cap</span><span className="val">{fromUsdc(bank.risk.globalDepositCap)}</span></div>
      <div className="kv"><span className="k">Max deposit / member</span><span className="val">{fromUsdc(bank.risk.maxDepositPerMember)}</span></div>
      <div className="kv"><span className="k">Max utilization</span><span className="val">{bank.risk.maxUtilizationBps / 100}%</span></div>
      <div className="kv"><span className="k">Withdrawal delay</span><span className="val">{bank.risk.withdrawalDelay}s</span></div>
      <div className="row" style={{gap: 8, marginTop: 14}}>
        <TxButton
          onClick={() =>
            tx
              .run(async () => {
                await ledger.requestApproval(clearSign.pause(bank.address, !bank.paused));
                await setPaused(wallet.walletClient!, bank.address, !bank.paused);
              }, bank.paused ? "Resumed ✓" : "Paused ✓")
              .then(onChange)
          }
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
