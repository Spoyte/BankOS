import {useState} from "react";
import type {Address} from "viem";
import {toUsdc, type Products, type RiskConfig} from "@bankos/shared";
import {useWallet} from "../wallet/WalletContext";
import {useAsync} from "../hooks";
import {banksOfSteward, getBankInfo, charterBank} from "../lib/contracts";
import {Field, Toggle, Notice, Money, Badge, BankLogo, useTx, TxButton, Section} from "../components";

export function Operator({onOpen}: {onOpen: (b: Address) => void}) {
  const wallet = useWallet();
  const mine = useAsync(async () => {
    if (!wallet.address) return [];
    const addrs = await banksOfSteward(wallet.address);
    return Promise.all(addrs.map(getBankInfo));
  }, [wallet.address]);

  return (
    <div className="grid cols-2" style={{alignItems: "start"}}>
      <CharterForm onChartered={() => mine.refresh()} />
      <div>
        <Section title="Your banks">
          {mine.loading && <div className="muted">Loading…</div>}
          {mine.data && mine.data.length === 0 && (
            <div className="muted">You haven't chartered a bank yet.</div>
          )}
          {mine.data?.map((b) => (
            <div key={b.address} className="card bank-card" style={{marginBottom: 10}} onClick={() => onOpen(b.address)}>
              <div className="row" style={{gap: 12}}>
                <BankLogo name={b.name} />
                <div style={{flex: 1}}>
                  <div className="row between">
                    <strong>{b.name}</strong>
                    {b.paused ? <Badge tone="red">Paused</Badge> : <Badge tone="green">Open</Badge>}
                  </div>
                  <div className="muted" style={{fontSize: 13}}>
                    <Money v={b.totalAssets} /> assets · {Number(b.utilizationBps) / 100}% util
                  </div>
                </div>
              </div>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

function CharterForm({onChartered}: {onChartered: () => void}) {
  const wallet = useWallet();
  const tx = useTx();
  const [name, setName] = useState("Brooklyn Mutual");
  const [brand, setBrand] = useState("ipfs://brand");
  const [products, setProducts] = useState<Products>({checking: true, yield: true, credit: true});
  const [globalCap, setGlobalCap] = useState("5000000");
  const [perMember, setPerMember] = useState("250000");
  const [perBorrower, setPerBorrower] = useState("50000");
  const [utilPct, setUtilPct] = useState("60");
  const [delay, setDelay] = useState("60");

  async function submit() {
    if (!wallet.walletClient) return;
    const risk: RiskConfig = {
      globalDepositCap: toUsdc(globalCap || "0"),
      maxDepositPerMember: toUsdc(perMember || "0"),
      maxCreditPerBorrower: toUsdc(perBorrower || "0"),
      maxUtilizationBps: Math.round(Number(utilPct) * 100),
      withdrawalDelay: Number(delay),
    };
    await tx.run(
      () => charterBank(wallet.walletClient!, {name, brandURI: brand, products, risk}),
      `Chartered "${name}" ✓`,
    );
    onChartered();
  }

  return (
    <Section title="Charter a new bank" icon="🏦">
      <Field label="Bank name">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Brand URI" hint="Logo / theme metadata (ipfs://, https://)">
        <input value={brand} onChange={(e) => setBrand(e.target.value)} />
      </Field>

      <div className="lbl muted" style={{fontSize: 13, margin: "6px 0"}}>
        Products
      </div>
      <Toggle on={products.checking} onChange={(v) => setProducts({...products, checking: v})} label="Private checking" />
      <Toggle on={products.yield} onChange={(v) => setProducts({...products, yield: v})} label="Treasury yield" />
      <Toggle on={products.credit} onChange={(v) => setProducts({...products, credit: v})} label="Credit lines" />

      <div className="sep" />
      <div className="lbl muted" style={{fontSize: 13, marginBottom: 8}}>
        Risk guard-rails
      </div>
      <div className="grid cols-2" style={{gap: 10}}>
        <Field label="Global deposit cap (USDC)">
          <input value={globalCap} onChange={(e) => setGlobalCap(e.target.value)} />
        </Field>
        <Field label="Max deposit / member">
          <input value={perMember} onChange={(e) => setPerMember(e.target.value)} />
        </Field>
        <Field label="Max credit / borrower">
          <input value={perBorrower} onChange={(e) => setPerBorrower(e.target.value)} />
        </Field>
        <Field label="Max utilization (%)" hint="loan-to-deposit ceiling">
          <input value={utilPct} onChange={(e) => setUtilPct(e.target.value)} />
        </Field>
        <Field label="Withdrawal delay (s)">
          <input value={delay} onChange={(e) => setDelay(e.target.value)} />
        </Field>
      </div>

      <TxButton onClick={submit} className="btn primary block" pending={tx.pending} disabled={!wallet.walletClient}>
        Charter bank
      </TxButton>
      {tx.error && <Notice tone="err">{tx.error}</Notice>}
      {tx.ok && <Notice tone="ok">{tx.ok}</Notice>}
    </Section>
  );
}
