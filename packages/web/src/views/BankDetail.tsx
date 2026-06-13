import {useState} from "react";
import type {Address} from "viem";
import {useWallet} from "../wallet/WalletContext";
import {useAsync} from "../hooks";
import {getBankInfo} from "../lib/contracts";
import {getBankActivity} from "../lib/events";
import {Money, Badge, BankLogo, Stat, Notice, Section} from "../components";
import {MemberPanel} from "./MemberPanel";
import {StewardPanel} from "./StewardPanel";

export function BankDetail({bank, onBack}: {bank: Address; onBack: () => void}) {
  const wallet = useWallet();
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const info = useAsync(() => getBankInfo(bank), [bank, version]);
  const isSteward = wallet.address && info.data && wallet.address.toLowerCase() === info.data.steward.toLowerCase();
  const initialTab =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "steward"
      ? "steward"
      : "member";
  const [tab, setTab] = useState<"member" | "steward">(initialTab);

  return (
    <div>
      <button className="btn ghost sm" onClick={onBack} style={{marginBottom: 14}}>
        ← All banks
      </button>

      {info.error && <Notice tone="err">{info.error}</Notice>}
      {info.data && (
        <>
          <div className="card">
            <div className="row between">
              <div className="row" style={{gap: 14}}>
                <BankLogo name={info.data.name} />
                <div>
                  <div className="row" style={{gap: 10}}>
                    <h2 style={{margin: 0}}>{info.data.name}</h2>
                    {info.data.paused ? <Badge tone="red">Paused</Badge> : <Badge tone="green">Open</Badge>}
                    {isSteward && <Badge tone="brand">You are the steward</Badge>}
                  </div>
                  <div className="faint mono" style={{fontSize: 12}}>{info.data.address}</div>
                </div>
              </div>
              <div className="row wrap" style={{gap: 6, justifyContent: "flex-end"}}>
                {info.data.products.checking && <Badge tone="brand">Checking</Badge>}
                {info.data.products.yield && <Badge>Yield</Badge>}
                {info.data.products.credit && <Badge>Credit</Badge>}
              </div>
            </div>
            <div className="sep" />
            <div className="stats">
              <Stat label="Total assets"><Money v={info.data.totalAssets} /></Stat>
              <Stat label="Deposits (liabilities)"><Money v={info.data.totalDeposits} /></Stat>
              <Stat label="Idle reserve"><Money v={info.data.idleLiquidity} /></Stat>
              <Stat label="In strategies"><Money v={info.data.strategyAssets} /></Stat>
              <Stat label="Outstanding credit"><Money v={info.data.totalDebt} /></Stat>
              <Stat label="Utilization">{Number(info.data.utilizationBps) / 100}%</Stat>
            </div>
          </div>

          <div className="tabs" style={{margin: "18px 0 16px"}}>
            <button className={`tab ${tab === "member" ? "active" : ""}`} onClick={() => setTab("member")}>
              Member
            </button>
            {isSteward && (
              <button className={`tab ${tab === "steward" ? "active" : ""}`} onClick={() => setTab("steward")}>
                Steward desk
              </button>
            )}
          </div>

          {tab === "member" ? (
            <MemberPanel bank={info.data} onChange={bump} version={version} />
          ) : (
            <StewardPanel bank={info.data} onChange={bump} version={version} />
          )}

          <div style={{marginTop: 16}}>
            <ActivityFeed bank={info.data.address} version={version} />
          </div>
        </>
      )}
    </div>
  );
}

function ActivityFeed({bank, version}: {bank: Address; version: number}) {
  const activity = useAsync(() => getBankActivity(bank), [bank, version]);
  return (
    <Section title="Recent activity" icon="🧾" action={<Badge>on-chain</Badge>}>
      {activity.loading && <div className="muted">Loading…</div>}
      {activity.data && activity.data.length === 0 && <div className="muted">No activity yet.</div>}
      {activity.data?.map((a, i) => (
        <div className="kv" key={`${a.txHash}-${i}`}>
          <span className="k">
            {a.label}
            {a.who && <span className="faint mono" style={{marginLeft: 8, fontSize: 12}}>{a.who.slice(0, 6)}…{a.who.slice(-4)}</span>}
          </span>
          <span className="val">
            {a.amount ? `${a.amount} USDC` : ""}
            <span className="faint" style={{marginLeft: 8, fontSize: 11}}>#{a.blockNumber.toString()}</span>
          </span>
        </div>
      ))}
    </Section>
  );
}
