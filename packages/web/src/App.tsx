import {useState} from "react";
import type {Address} from "viem";
import {useWallet} from "./wallet/WalletContext";
import {Landing} from "./views/Landing";
import {Discover} from "./views/Discover";
import {Operator} from "./views/Operator";
import {BankDetail} from "./views/BankDetail";
import {WalletBar} from "./views/WalletBar";
import {SystemStatus} from "./views/SystemStatus";

type View = "discover" | "operator";

function initialBank(): Address | null {
  if (typeof window === "undefined") return null;
  const b = new URLSearchParams(window.location.search).get("bank");
  return b && /^0x[0-9a-fA-F]{40}$/.test(b) ? (b as Address) : null;
}

export function App() {
  const wallet = useWallet();
  const [view, setView] = useState<View>("discover");
  const [bank, setBank] = useState<Address | null>(initialBank);

  return (
    <div className="app">
      <nav className="nav">
        <div className="logo">
          <span className="mark">C</span> Charter
        </div>
        <div className="tabs">
          <button className={`tab ${view === "discover" && !bank ? "active" : ""}`} onClick={() => {setView("discover"); setBank(null);}}>
            Discover
          </button>
          <button className={`tab ${view === "operator" && !bank ? "active" : ""}`} onClick={() => {setView("operator"); setBank(null);}}>
            Operator
          </button>
        </div>
        <div className="spacer" />
        <SystemStatus />
        <WalletBar />
      </nav>

      {!wallet.isConnected ? (
        <Landing />
      ) : bank ? (
        <BankDetail bank={bank} onBack={() => setBank(null)} />
      ) : view === "discover" ? (
        <Discover onOpen={setBank} />
      ) : (
        <Operator onOpen={setBank} />
      )}

      <footer style={{marginTop: 60, textAlign: "center"}} className="faint">
        Charter · private, compliant stablecoin banks on Arc · Unlink · Chainlink CRE · Dynamic
      </footer>
    </div>
  );
}
