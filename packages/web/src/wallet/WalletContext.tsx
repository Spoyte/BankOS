import {createContext, lazy, Suspense, useContext, useMemo, useState, type ReactNode} from "react";
import {createPublicClient, createWalletClient, http, type PublicClient} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {chain, RPC_URL, DYNAMIC_ENV_ID} from "../config";
import {LOCAL_ACCOUNTS, type WalletState} from "./types";

// Lazy-loaded so the default local-persona build never eagerly bundles the (large) Dynamic SDK.
const DynamicWalletProvider = lazy(() =>
  import("./DynamicWallet").then((m) => ({default: m.DynamicWalletProvider})),
);

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export const publicClient: PublicClient = createPublicClient({chain, transport: http(RPC_URL)});

function initialPersona(): string | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search).get("persona");
  return p && LOCAL_ACCOUNTS.some((a) => a.id === p) ? p : null;
}

function LocalWalletProvider({children}: {children: ReactNode}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialPersona);

  const value = useMemo<WalletState>(() => {
    const acct = LOCAL_ACCOUNTS.find((a) => a.id === selectedId);
    const walletClient = acct
      ? createWalletClient({account: privateKeyToAccount(acct.pk), chain, transport: http(RPC_URL)})
      : undefined;
    return {
      mode: "local",
      address: acct?.address,
      label: acct?.label,
      walletClient,
      publicClient,
      isConnected: Boolean(acct),
      connect: () => {
        if (!selectedId) setSelectedId(LOCAL_ACCOUNTS[0].id);
      },
      disconnect: () => setSelectedId(null),
      localAccounts: LOCAL_ACCOUNTS,
      selectLocal: (id: string) => setSelectedId(id),
    };
  }, [selectedId]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletProvider({children}: {children: ReactNode}) {
  if (DYNAMIC_ENV_ID) {
    return (
      <Suspense fallback={<div className="app"><div className="card muted">Loading wallet…</div></div>}>
        <DynamicWalletProvider context={WalletContext} publicClient={publicClient}>
          {children}
        </DynamicWalletProvider>
      </Suspense>
    );
  }
  return <LocalWalletProvider>{children}</LocalWalletProvider>;
}
