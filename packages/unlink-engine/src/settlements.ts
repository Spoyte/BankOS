/**
 * Inter-bank settlement (feature #9).
 *
 * Banks chartered on the same factory settle obligations with each other **privately**: a settlement is
 * a real private transfer (off-chain, hidden) between the two banks' treasury accounts in the shielded
 * ledger. Settlements are recorded with the bank identities so the engine can **net** mutual positions —
 * the classic inter-bank netting story — without any of it touching the public chain.
 *
 * Each bank publishes a treasury settlement account (an unlink1… address) so counterparties can find it.
 */
export interface Settlement {
  id: string;
  fromBank: string; // EVM address of the paying bank
  toBank: string; // EVM address of the receiving bank
  token: string;
  amount: bigint; // value settled, base units
  memo: string;
  at: number; // unix seconds
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export interface NetPosition {
  bankA: string;
  bankB: string;
  grossAToB: bigint; // total A has paid B
  grossBToA: bigint; // total B has paid A
  net: bigint; // > 0: A net owes B; < 0: B net owes A
  count: number; // settlements between the pair
}

export class SettlementBook {
  private items: Settlement[] = [];
  private treasury = new Map<string, string>(); // bank(lower) -> unlink1… treasury account

  registerTreasury(bank: string, unlinkAddress: string) {
    this.treasury.set(bank.toLowerCase(), unlinkAddress);
  }
  treasuryOf(bank: string): string | undefined {
    return this.treasury.get(bank.toLowerCase());
  }

  record(s: Settlement) {
    this.items.push(s);
  }

  /** All settlements a bank is a party to, newest first. */
  forBank(bank: string): Settlement[] {
    return this.items.filter((s) => eq(s.fromBank, bank) || eq(s.toBank, bank)).reverse();
  }

  /** Net obligation between two banks from recorded gross settlements (the netting figure). */
  net(bankA: string, bankB: string): NetPosition {
    let grossAToB = 0n;
    let grossBToA = 0n;
    let count = 0;
    for (const s of this.items) {
      if (eq(s.fromBank, bankA) && eq(s.toBank, bankB)) {
        grossAToB += s.amount;
        count++;
      } else if (eq(s.fromBank, bankB) && eq(s.toBank, bankA)) {
        grossBToA += s.amount;
        count++;
      }
    }
    return {bankA, bankB, grossAToB, grossBToA, net: grossAToB - grossBToA, count};
  }

  all(): Settlement[] {
    return this.items;
  }
}
