import {Badge} from "../components";
import {useWallet} from "../wallet/WalletContext";

export function Landing() {
  const wallet = useWallet();
  return (
    <div>
      <div className="hero">
        <Badge tone="brand">Bank factory · on Arc</Badge>
        <h1 style={{marginTop: 18}}>
          Charter your own <span className="grad">private, compliant</span>
          <br /> stablecoin bank — in minutes.
        </h1>
        <p>
          Launch a branded, self-custodial bank with private balances (Unlink), programmable
          compliance (Chainlink CRE) and passkey onboarding (Dynamic), settled in USDC on Arc.
          Stewards set policy. Members keep their keys.
        </p>
        <div className="row" style={{justifyContent: "center"}}>
          {wallet.mode === "local" ? (
            <span className="chip">Pick a persona in the top-right to begin →</span>
          ) : (
            <button className="btn primary" onClick={() => wallet.connect()}>
              Sign in with Dynamic
            </button>
          )}
        </div>
        <div className="pills">
          <Badge>🔒 Private checking & transfers</Badge>
          <Badge>✅ Confidential KYC, on-chain policy</Badge>
          <Badge>💳 Policy-gated credit lines</Badge>
          <Badge>📈 Guard-railed treasury yield</Badge>
        </div>
      </div>

      <div className="grid cols-3">
        <div className="card">
          <h3>1 · Charter</h3>
          <p className="muted">
            Pick a name, products (checking / yield / credit) and risk caps. A new bank is deployed as
            a minimal-proxy clone, wired to shared compliance + treasury rails.
          </p>
        </div>
        <div className="card">
          <h3>2 · Onboard</h3>
          <p className="muted">
            Members join with a wallet, submit KYC to the Chainlink CRE workflow (confidential), and an
            eligibility <span className="private-tag">Policy</span> lands on-chain — no PII.
          </p>
        </div>
        <div className="card">
          <h3>3 · Bank privately</h3>
          <p className="muted">
            Deposit USDC, hold a <span className="private-tag">private</span> balance via Unlink, send
            private transfers, draw a credit line, and let the steward route idle reserve into yield.
          </p>
        </div>
      </div>
    </div>
  );
}
