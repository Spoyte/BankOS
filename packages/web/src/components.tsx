import {useState, type ReactNode} from "react";
import {fromUsdc} from "@bankos/shared";

export function Money({v, sym = "USDC"}: {v: bigint; sym?: string}) {
  const s = fromUsdc(v);
  const [whole, frac] = s.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (
    <span className="mono">
      {grouped}
      {frac ? `.${frac}` : ""} <span className="faint">{sym}</span>
    </span>
  );
}

export function Stat({label, children}: {label: string; children: ReactNode}) {
  return (
    <div className="stat">
      <div className="v">{children}</div>
      <div className="l">{label}</div>
    </div>
  );
}

export function Badge({children, tone = "default"}: {children: ReactNode; tone?: "default" | "green" | "amber" | "red" | "brand"}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Toggle({on, onChange, label}: {on: boolean; onChange: (v: boolean) => void; label: string}) {
  return (
    <div className="toggle-row">
      <button className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} aria-label={label}>
        <span className="knob" />
      </button>
      <span>{label}</span>
    </div>
  );
}

export function Field({label, children, hint}: {label: string; children: ReactNode; hint?: string}) {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </label>
  );
}

export function Notice({tone, children}: {tone: "err" | "ok" | "info"; children: ReactNode}) {
  return <div className={`notice ${tone}`}>{children}</div>;
}

export function BankLogo({name}: {name: string}) {
  return <div className="bank-logo">{(name || "?").slice(0, 1).toUpperCase()}</div>;
}

export function Section({title, icon, children, action}: {title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode}) {
  return (
    <div className="card">
      <div className="row between" style={{marginBottom: 14}}>
        <div className="section-title">
          {icon && <span className="ico">{icon}</span>}
          <h3 style={{margin: 0}}>{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Async action state. */
export function useTx() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [ok, setOk] = useState<string>();

  async function run(fn: () => Promise<unknown>, successMsg?: string) {
    setPending(true);
    setError(undefined);
    setOk(undefined);
    try {
      await fn();
      if (successMsg) setOk(successMsg);
    } catch (e: any) {
      setError(parseErr(e));
    } finally {
      setPending(false);
    }
  }
  return {pending, error, ok, run, setError, clear: () => { setError(undefined); setOk(undefined); }};
}

function parseErr(e: any): string {
  const m = e?.shortMessage ?? e?.details ?? e?.message ?? String(e);
  // surface custom-error names from the contracts
  const match = /([A-Z][A-Za-z]+)\(\)/.exec(m);
  if (match && /revert|reverted|custom error/i.test(m)) return `Reverted: ${match[1]}`;
  return m.length > 180 ? m.slice(0, 180) + "…" : m;
}

export function TxButton({
  onClick,
  children,
  className = "btn primary",
  disabled,
  pending,
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  pending?: boolean;
}) {
  return (
    <button className={className} onClick={onClick} disabled={disabled || pending}>
      {pending && <span className="spin" />} {children}
    </button>
  );
}
