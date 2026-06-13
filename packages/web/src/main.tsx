import React from "react";
import ReactDOM from "react-dom/client";
import {App} from "./App";
import {WalletProvider} from "./wallet/WalletContext";
import {LedgerProvider} from "./ledger/LedgerProvider";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WalletProvider>
      <LedgerProvider>
        <App />
      </LedgerProvider>
    </WalletProvider>
  </React.StrictMode>,
);
