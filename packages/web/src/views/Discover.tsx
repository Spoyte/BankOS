import type {Address} from "viem";
import {useAsync} from "../hooks";
import {listBanks, getBankInfo, type BankInfo} from "../lib/contracts";
import {Money, Badge, BankLogo, Notice} from "../components";
import {StatementVerifier} from "./StatementVerifier";

export function Discover({onOpen}: {onOpen: (b: Address) => void}) {
  const banks = useAsync(async () => {
    const addrs = await listBanks();
    return Promise.all(addrs.map(getBankInfo));
  }, []);

  return (
    <div>
      <div className="row between" style={{marginBottom: 16}}>
        <div>
          <h2 style={{margin: 0}}>Discover banks</h2>
          <span className="muted">Chartered on Arc · all balances private by default</span>
        </div>
      </div>

      {banks.loading && <div className="card muted">Loading banks…</div>}
      {banks.error && <Notice tone="err">{banks.error}</Notice>}
      {banks.data && banks.data.length === 0 && (
        <div className="card muted">No banks chartered yet. Head to the Operator tab to charter one.</div>
      )}

      <div className="grid cols-2">
        {banks.data?.map((b) => (
          <BankCard key={b.address} info={b} onOpen={() => onOpen(b.address)} />
        ))}
      </div>

      <div style={{marginTop: 24, maxWidth: 620}}>
        <StatementVerifier />
      </div>
    </div>
  );
}

function BankCard({info, onOpen}: {info: BankInfo; onOpen: () => void}) {
  return (
    <div className="card bank-card" onClick={onOpen}>
      <div className="row" style={{gap: 14}}>
        <BankLogo name={info.name} />
        <div style={{flex: 1}}>
          <div className="row between">
            <h3 style={{margin: 0}}>{info.name}</h3>
            {info.paused ? <Badge tone="red">Paused</Badge> : <Badge tone="green">Open</Badge>}
          </div>
          <div className="faint mono" style={{fontSize: 12}}>
            steward {info.steward.slice(0, 6)}…{info.steward.slice(-4)}
          </div>
        </div>
      </div>
      <div className="sep" />
      <div className="row between">
        <div>
          <div className="muted" style={{fontSize: 12}}>
            Total assets
          </div>
          <div style={{fontSize: 18, fontWeight: 700}}>
            <Money v={info.totalAssets} />
          </div>
        </div>
        <div className="row wrap" style={{gap: 6, justifyContent: "flex-end"}}>
          {info.products.checking && <Badge tone="brand">Checking</Badge>}
          {info.products.yield && <Badge>Yield</Badge>}
          {info.products.credit && <Badge>Credit</Badge>}
        </div>
      </div>
    </div>
  );
}
