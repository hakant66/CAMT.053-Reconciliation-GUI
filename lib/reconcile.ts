import type { BankTxn } from "@/lib/camt";

export interface InternalTxn {
  int_id: number;
  TxnId?: string;
  Invoice?: string;
  Counterparty?: string;
  Amount: number;
  Currency?: string;
  BookDate: string;
  Direction: string; // DBIT/CRDT
}

function parseYMD(s: string | null | undefined): Date | null { if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d; }
function dayDiff(a: string | null, b: string | null): number | null { const da = parseYMD(a); const db = parseYMD(b); if (!da || !db) return null; return Math.floor(Math.abs(da.getTime() - db.getTime()) / 86400000); }

export function reconcile(
  bank: BankTxn[],
  internal: InternalTxn[],
  opts: { amountTolerance: number; dateToleranceDays: number }
) {
  const { amountTolerance, dateToleranceDays } = opts;
  const b = bank.map((x, i) => ({ ...x, bank_id: i }));
  const ints = internal.map((x, i) => ({ ...x, int_id: i }));

  const detMatches: any[] = [];
  const matchedBank = new Set<number>();
  const matchedInt = new Set<number>();

  // A) Exact EndToEndId == Invoice
  const invoiceIndex = new Map<string, InternalTxn[]>();
  for (const it of ints) { const key = (it.Invoice || "").trim(); if (!invoiceIndex.has(key)) invoiceIndex.set(key, []); invoiceIndex.get(key)!.push(it); }
  for (const bt of b) {
    const key = (bt.EndToEndId || "").trim();
    const cands = invoiceIndex.get(key) || [];
    if (key && cands.length) {
      const cand = cands.find((c) => !matchedInt.has(c.int_id));
      if (cand) { detMatches.push({ bank: bt, int: cand, rule: "E2E=Invoice" }); matchedBank.add(bt.bank_id); matchedInt.add(cand.int_id); }
    }
  }

  // B) Fuzzy: amount ± tolerance, same direction, date within N days
  const fuzzyMatches: any[] = [];
  const remainingBank = b.filter((x) => !matchedBank.has(x.bank_id));
  const remainingInt = ints.filter((x) => !matchedInt.has(x.int_id));
  const intBuckets = new Map<string, InternalTxn[]>();
  for (const it of remainingInt) { const key = it.Direction || ""; if (!intBuckets.has(key)) intBuckets.set(key, []); intBuckets.get(key)!.push(it); }
  for (const bt of remainingBank) {
    const bucket = intBuckets.get(bt.Dir || "") || [];
    const cand = bucket.find((it) => !matchedInt.has(it.int_id) && Math.abs((it.Amount ?? 0) - (bt.Amount ?? 0)) <= amountTolerance && (() => { const dd = dayDiff(it.BookDate, bt.BookDate); return dd !== null ? dd <= dateToleranceDays : false; })());
    if (cand) { fuzzyMatches.push({ bank: bt, int: cand, rule: `Amount±${amountTolerance}, Date±${dateToleranceDays}d` }); matchedBank.add(bt.bank_id); matchedInt.add(cand.int_id); }
  }

  const matched = [...detMatches, ...fuzzyMatches];
  const bankOnly = b.filter((x) => !matchedBank.has(x.bank_id));
  const internalOnly = ints.filter((x) => !matchedInt.has(x.int_id));

  return { matched, bankOnly, internalOnly };
}

