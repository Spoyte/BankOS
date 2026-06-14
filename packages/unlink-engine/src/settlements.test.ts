import {describe, it, expect} from "vitest";
import {SettlementBook, type Settlement} from "./settlements.js";

const A = "0xAAaA000000000000000000000000000000000001";
const B = "0xBBbB000000000000000000000000000000000002";
const C = "0xCCcC000000000000000000000000000000000003";

function s(fromBank: string, toBank: string, amount: bigint, id: string): Settlement {
  return {id, fromBank, toBank, token: "0xusdc", amount, memo: "", at: 0};
}

describe("SettlementBook treasury registry", () => {
  it("publishes and resolves a bank's treasury account (case-insensitive)", () => {
    const book = new SettlementBook();
    book.registerTreasury(A, "unlink1treasuryA");
    expect(book.treasuryOf(A.toLowerCase())).toBe("unlink1treasuryA");
    expect(book.treasuryOf(B)).toBeUndefined();
  });
});

describe("SettlementBook netting", () => {
  it("nets gross flows between two banks", () => {
    const book = new SettlementBook();
    book.record(s(A, B, 1000n, "1"));
    book.record(s(A, B, 500n, "2"));
    book.record(s(B, A, 200n, "3"));
    const net = book.net(A, B);
    expect(net.grossAToB).toBe(1500n);
    expect(net.grossBToA).toBe(200n);
    expect(net.net).toBe(1300n); // A net owes B 1300
    expect(net.count).toBe(3);
  });

  it("net is symmetric in sign when the pair is flipped", () => {
    const book = new SettlementBook();
    book.record(s(A, B, 1000n, "1"));
    expect(book.net(A, B).net).toBe(1000n);
    expect(book.net(B, A).net).toBe(-1000n);
  });

  it("ignores settlements involving other banks", () => {
    const book = new SettlementBook();
    book.record(s(A, B, 1000n, "1"));
    book.record(s(A, C, 9999n, "2"));
    const net = book.net(A, B);
    expect(net.net).toBe(1000n);
    expect(net.count).toBe(1);
  });

  it("forBank returns a bank's settlements newest-first", () => {
    const book = new SettlementBook();
    book.record(s(A, B, 1n, "1"));
    book.record(s(C, A, 2n, "2"));
    book.record(s(B, C, 3n, "3")); // not A's
    const mine = book.forBank(A);
    expect(mine.map((x) => x.id)).toEqual(["2", "1"]);
  });
});
