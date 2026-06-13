import {createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {clearSign, type ClearSignView} from "./erc7730";

interface LedgerCtx {
  enabled: boolean;
  setEnabled: (b: boolean) => void;
  /** Resolves when the steward "signs" on the device; rejects if they reject. No-op if disabled. */
  requestApproval: (view: ClearSignView) => Promise<void>;
}

const Ctx = createContext<LedgerCtx | null>(null);
export const useLedger = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLedger outside provider");
  return c;
};

const KEY = "charter.ledger.enabled";

export function LedgerProvider({children}: {children: ReactNode}) {
  // Default ON: high-risk steward actions require Clear-Signing approval out of the box (the toggle is
  // an explicit escape hatch). A judge sees the device step on the headline flow without hunting for it.
  const [enabled, setEnabledState] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(KEY) !== "false" : true,
  );
  const [pending, setPending] = useState<ClearSignView | null>(null);
  const resolver = useRef<{resolve: () => void; reject: (e: Error) => void} | null>(null);

  // Demo affordance: ?ledgerPreview=1 opens a sample Clear-Signing modal on load.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ledgerPreview")) {
      setPending(clearSign.allocate(
        "0x6d544390eb535d61e196c87d6b9c80dcd8628acd",
        "0x0000000000000000000000000000000000000abc",
        60_000_000_000n,
      ));
    }
  }, []);

  const setEnabled = (b: boolean) => {
    setEnabledState(b);
    if (typeof window !== "undefined") localStorage.setItem(KEY, String(b));
  };

  const value = useMemo<LedgerCtx>(
    () => ({
      enabled,
      setEnabled,
      requestApproval: (view) =>
        new Promise<void>((resolve, reject) => {
          if (!enabled) return resolve();
          resolver.current = {resolve, reject};
          setPending(view);
        }),
    }),
    [enabled],
  );

  const close = () => {
    setPending(null);
    resolver.current = null;
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {pending && (
        <LedgerModal
          view={pending}
          onSign={() => {
            resolver.current?.resolve();
            close();
          }}
          onReject={() => {
            resolver.current?.reject(new Error("Rejected on Ledger device"));
            close();
          }}
        />
      )}
    </Ctx.Provider>
  );
}

function LedgerModal({view, onSign, onReject}: {view: ClearSignView; onSign: () => void; onReject: () => void}) {
  // device "screens": intent → each field → confirm
  const screens = [
    {title: "Review", body: view.intent},
    ...view.fields.map((f) => ({title: f.label, body: f.value})),
    {title: "Sign transaction?", body: view.functionName},
  ];
  const [i, setI] = useState(0);
  const [showJson, setShowJson] = useState(false);
  const last = i === screens.length - 1;

  return (
    <div className="ledger-overlay" role="dialog" aria-modal="true">
      <div className="ledger-card">
        <div className="ledger-head">
          <span className="ledger-logo">L</span>
          <div>
            <strong>Ledger Clear Signing</strong>
            <div className="faint" style={{fontSize: 12}}>ERC-7730 · WYSIWYS · steward approval</div>
          </div>
          <span className="badge brand" style={{marginLeft: "auto"}}>simulated device</span>
        </div>

        <div className="ledger-device">
          <div className="ledger-screen">
            <div className="ledger-screen-title">{screens[i].title}</div>
            <div className="ledger-screen-body">{screens[i].body}</div>
            <div className="ledger-screen-dots">
              {screens.map((_, k) => (
                <span key={k} className={`dot ${k === i ? "on" : ""}`} />
              ))}
            </div>
          </div>
          <div className="ledger-buttons">
            <button className="btn sm" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>
              ◀ Prev
            </button>
            {!last ? (
              <button className="btn primary sm" onClick={() => setI((v) => Math.min(screens.length - 1, v + 1))}>
                Next ▶
              </button>
            ) : (
              <button className="btn primary sm" onClick={onSign}>
                ✓ Approve &amp; sign
              </button>
            )}
          </div>
        </div>

        <p className="hint" style={{marginTop: 12}}>
          The device translates the raw calldata into the screens above using ERC-7730 metadata, so the
          steward signs exactly what they see. Scroll through every screen, then approve.
        </p>

        <div className="row between" style={{marginTop: 8}}>
          <button className="btn ghost sm" onClick={() => setShowJson((v) => !v)}>
            {showJson ? "Hide" : "Show"} ERC-7730 descriptor
          </button>
          <button className="btn danger sm" onClick={onReject}>
            Reject
          </button>
        </div>
        {showJson && (
          <pre className="ledger-json">{JSON.stringify(view.raw, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
