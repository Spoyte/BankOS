import {useState} from "react";
import type {Address} from "viem";
import {useWallet} from "../wallet/WalletContext";
import {useAsync} from "../hooks";
import {getBankInfo} from "../lib/contracts";
import {Money, Badge, BankLogo, Stat, Notice} from "../components";
import {MemberPanel} from "./MemberPanel";
import {StewardPanel} from "./StewardPanel";

export function BankDetail({bank, onBack}: {bank: Address; onBack: () => void}) {
  const wallet = useWallet();
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const info = useAsync(() => getBankInfo(bank), [bank, version]);
  const isSteward = wallet.address && info.data && wallet.address.toLowerCase() === info.data.steward.toLowerCase();
  const [tab, setTab] = useState<"member" | "steward">("member");

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
        </>
      )}
    </div>
  );
}
