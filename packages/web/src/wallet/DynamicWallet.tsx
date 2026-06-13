import {useEffect, useMemo, useState, type Context, type ReactNode} from "react";
import type {Address, PublicClient, WalletClient} from "viem";
import {DynamicContextProvider, useDynamicContext} from "@dynamic-labs/sdk-react-core";
import {EthereumWalletConnectors, isEthereumWallet} from "@dynamic-labs/ethereum";
import {DYNAMIC_ENV_ID, chain} from "../config";
import type {WalletState} from "./types";

/**
 * Dynamic embedded-wallet path (production onboarding). Members log in with a passkey / social and
 * receive a non-custodial embedded wallet — no MetaMask. Enabled when VITE_DYNAMIC_ENVIRONMENT_ID
 * is set. Best used against Arc testnet (configure the Arc network in your Dynamic dashboard).
 */
function DynamicBridge({
  context,
  publicClient,
  children,
}: {
  context: Context<WalletState | null>;
  publicClient: PublicClient;
  children: ReactNode;
}) {
  const {primaryWallet, setShowAuthFlow, handleLogOut} = useDynamicContext();
  const [walletClient, setWalletClient] = useState<WalletClient | undefined>();
  const [address, setAddress] = useState<Address | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (primaryWallet && isEthereumWallet(primaryWallet)) {
        try {
          const wc = (await primaryWallet.getWalletClient()) as unknown as WalletClient;
          if (!cancelled) {
            setWalletClient(wc);
            setAddress(primaryWallet.address as Address);
          }
        } catch {
          /* wallet not ready yet */
        }
      } else {
        setWalletClient(undefined);
        setAddress(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [primaryWallet]);

  const value = useMemo<WalletState>(
    () => ({
      mode: "dynamic",
      address,
      label: primaryWallet?.address ? `${primaryWallet.address.slice(0, 6)}…` : undefined,
      walletClient,
      publicClient,
      isConnected: Boolean(walletClient && address),
      connect: () => setShowAuthFlow(true),
      disconnect: () => handleLogOut(),
    }),
    [address, walletClient, primaryWallet, publicClient, setShowAuthFlow, handleLogOut],
  );

  const Provider = context.Provider;
  return <Provider value={value}>{children}</Provider>;
}

export function DynamicWalletProvider({
  context,
  publicClient,
  children,
}: {
  context: Context<WalletState | null>;
  publicClient: PublicClient;
  children: ReactNode;
}) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: DYNAMIC_ENV_ID!,
        walletConnectors: [EthereumWalletConnectors],
        overrides: {evmNetworks: [networkFor(chain)]},
      }}
    >
      <DynamicBridge context={context} publicClient={publicClient}>
        {children}
      </DynamicBridge>
    </DynamicContextProvider>
  );
}

function networkFor(c: typeof chain) {
  return {
    blockExplorerUrls: [c.blockExplorers?.default.url ?? ""],
    chainId: c.id,
    chainName: c.name,
    iconUrls: [],
    name: c.name,
    nativeCurrency: c.nativeCurrency,
    networkId: c.id,
    rpcUrls: [c.rpcUrls.default.http[0]],
    vanityName: c.name,
  };
}
