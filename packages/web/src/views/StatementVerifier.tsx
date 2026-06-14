import {useState} from "react";
import {Section, Badge, Notice, TxButton, useTx} from "../components";
import {verifyStatementToken, formatBand, type VerifyResult} from "../lib/statements";
import {deployment} from "../config";

/**
 * Selective-disclosure verifier (feature #7) — a public, trustless check. An auditor or lender pastes a
 * statement a member gave them; we verify the signature **client-side** (viem `verifyMessage`) against the
 * bank's known signer. No call back to the bank is required, and only the disclosed claims are revealed.
 */
export function StatementVerifier() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const tx = useTx();

  async function verify() {
    setResult(null);
    await tx.run(async () => {
      const r = await verifyStatementToken(token.trim(), deployment.engineRelayer);
      setResult(r);
      if (!r.valid) throw new Error(r.reason ?? "invalid statement");
    }, "Statement verified ✓");
  }

  const c = result?.statement?.claims;
  return (
    <Section title="Verify a disclosure statement" icon="🔎" action={<Badge tone="brand">trustless</Badge>}>
      <p className="muted" style={{marginTop: 0}}>
        Paste a statement a member shared. The signature is checked in your browser against the bank's
        signer — you only see what they chose to disclose.
      </p>
      <textarea
        className="input mono"
        style={{width: "100%", minHeight: 90, fontSize: 12}}
        placeholder="Paste statement token…"
        value={token}
        onChange={(e) => setToken(e.target.value)}
      />
      <TxButton onClick={verify} className="btn primary block" pending={tx.pending} disabled={!token.trim()}>
        Verify statement
      </TxButton>
      {tx.error && <Notice tone="err">{tx.error}</Notice>}

      {result?.valid && c && (
        <div style={{marginTop: 14}}>
          <Notice tone="ok">
            ✓ Valid — signed by the bank ({result.signer?.slice(0, 6)}…{result.signer?.slice(-4)})
          </Notice>
          <div className="sep" />
          <div className="muted" style={{fontSize: 12, marginBottom: 8}}>
            Subject <span className="mono">{result.statement?.subject.slice(0, 18)}…</span> · disclosed claims:
          </div>
          <ul style={{margin: 0, paddingLeft: 18, lineHeight: 1.9}}>
            {c.balanceBand && (
              <li>
                🔒 Private balance in range <strong>{formatBand(c.balanceBand)}</strong>{" "}
                <span className="faint">(exact amount not revealed)</span>
              </li>
            )}
            {c.compliance && (
              <li>
                ✅ Compliance: <strong>tier {c.compliance.tier}</strong>, jurisdiction{" "}
                <strong>{c.compliance.jurisdiction || "—"}</strong>
                {c.compliance.canBorrow ? " · borrow-eligible" : ""}{" "}
                <span className="faint">(attested via Chainlink CRE)</span>
              </li>
            )}
            {c.activity && (
              <li>
                📈 Account: {c.activity.registered ? "active" : "not yet active"}, {c.activity.privateTransfers}{" "}
                private transfer(s) <span className="faint">(counterparties hidden)</span>
              </li>
            )}
          </ul>
          {result.statement?.expiresAt && (
            <div className="faint" style={{fontSize: 11, marginTop: 10}}>
              statement valid until {new Date(result.statement.expiresAt * 1000).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
