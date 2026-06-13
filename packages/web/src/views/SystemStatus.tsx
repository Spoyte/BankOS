import {useEffect, useState} from "react";
import {getHealth, CHAIN_LABEL, type Health} from "../lib/health";

/** Live backend status — makes it obvious the app is contract-backed and whether the stack is up,
 *  so a failing service is visible (not a silent error) during a demo. */
export function SystemStatus() {
  const [h, setH] = useState<Health>();
  useEffect(() => {
    let live = true;
    const tick = () => getHealth().then((x) => live && setH(x));
    tick();
    const id = setInterval(tick, 6000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  if (!h) return null;
  const allUp = h.chain && h.policy && h.engine;
  const color = !h.chain ? "var(--red)" : !allUp ? "var(--amber)" : "var(--green)";
  const title = `chain ${h.chain ? "up" : "down"} · policy ${h.policy ? "up" : "down"} · engine ${h.engine ? "up" : "down"}`;

  return (
    <span className="chip" title={title}>
      <span className="dot" style={{background: color}} />
      {allUp ? `Contract-backed · ${CHAIN_LABEL}` : "Services offline"}
      {h.blockNumber !== undefined && (
        <span className="faint" style={{fontSize: 11}}>#{h.blockNumber.toString()}</span>
      )}
    </span>
  );
}
