import {describe, it, expect} from "vitest";
import {privateKeyToAccount} from "viem/accounts";
import {
  bandFor,
  canonical,
  encodeStatement,
  verifyStatementToken,
  type SignedStatement,
  type Statement,
} from "./statements.js";

const account = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

function sampleStatement(): Statement {
  const now = Math.floor(Date.now() / 1000);
  return {
    issuer: "BankOS",
    subject: "unlink1examplesubjectaddress",
    bank: "0x1111111111111111111111111111111111111111",
    claims: {
      balanceBand: {token: "0xusdc", currency: "USDC", decimals: 6, lower: "20000000000", upper: "30000000000"},
      compliance: {tier: 2, jurisdiction: "US-NY", canDeposit: true, canBorrow: true, expiry: now + 86400},
      activity: {registered: true, privateTransfers: 3},
    },
    issuedAt: now,
    expiresAt: now + 600,
    nonce: "0xabc123",
  };
}

async function sign(statement: Statement): Promise<SignedStatement> {
  const signature = await account.signMessage({message: canonical(statement)});
  return {statement, signature, signer: account.address};
}

describe("bandFor", () => {
  it("floors to the band and gives a [lower, upper) window", () => {
    expect(bandFor(23_000n, 10_000n)).toEqual({lower: 20_000n, upper: 30_000n});
    expect(bandFor(20_000n, 10_000n)).toEqual({lower: 20_000n, upper: 30_000n});
    expect(bandFor(0n, 10_000n)).toEqual({lower: 0n, upper: 10_000n});
  });
  it("bandSize <= 0 means exact disclosure", () => {
    expect(bandFor(23_000n, 0n)).toEqual({lower: 23_000n, upper: 23_000n});
  });
});

describe("canonical", () => {
  it("is stable regardless of key insertion order", () => {
    expect(canonical({b: 1, a: {d: 4, c: 3}})).toBe(canonical({a: {c: 3, d: 4}, b: 1}));
  });
});

describe("verifyStatementToken", () => {
  it("verifies a genuine signed statement (trustless, no server)", async () => {
    const token = encodeStatement(await sign(sampleStatement()));
    const res = await verifyStatementToken(token);
    expect(res.valid).toBe(true);
    expect(res.signer?.toLowerCase()).toBe(account.address.toLowerCase());
    expect(res.statement?.claims.compliance?.tier).toBe(2);
  });

  it("enforces the trusted-signer check", async () => {
    const token = encodeStatement(await sign(sampleStatement()));
    const res = await verifyStatementToken(token, "0x000000000000000000000000000000000000dEaD");
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/untrusted/);
  });

  it("rejects a tampered claim (signature no longer matches)", async () => {
    const signed = await sign(sampleStatement());
    signed.statement.claims.balanceBand!.upper = "99999999999"; // forge a higher balance band
    const res = await verifyStatementToken(encodeStatement(signed));
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/signature/);
  });

  it("rejects an expired statement", async () => {
    const s = sampleStatement();
    s.issuedAt -= 3600;
    s.expiresAt = Math.floor(Date.now() / 1000) - 60;
    const res = await verifyStatementToken(encodeStatement(await sign(s)));
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/expired/);
  });

  it("rejects a malformed token", async () => {
    expect((await verifyStatementToken("not-a-token")).valid).toBe(false);
  });
});
