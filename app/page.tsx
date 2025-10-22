"use client";
import React, { useState, useCallback } from "react";
import DropZone from "@/components/DropZone";
import { parseCSV, toCSV } from "@/lib/csv";
import { parseCamt053, type BankTxn } from "@/lib/camt";
import { reconcile, type InternalTxn } from "@/lib/reconcile";

export default function Page() {
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [amountTol, setAmountTol] = useState<number>(0.01);
  const [dateTolDays, setDateTolDays] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<null | {
    matched: any[]; bankOnly: BankTxn[]; internalOnly: InternalTxn[];
    opening?: { amt: number; ccy: string | null }; closing?: { amt: number; ccy: string | null };
    iban: string | null; sumMovements: number; calcClosing?: number; balanceOk?: boolean;
  }>(null);

  const acceptXML = (f: File) => f.type.includes("xml") || f.name.toLowerCase().endsWith(".xml");
  const acceptCSV = (f: File) => f.type.includes("csv") || f.name.toLowerCase().endsWith(".csv");

  const onDropXML = useCallback((f: File) => setXmlFile(f), []);
  const onDropCSV = useCallback((f: File) => setCsvFile(f), []);

  async function handleProcess() {
    try {
      setErr(null);
      setProcessing(true);
      if (!xmlFile || !csvFile) throw new Error("Please select both files (XML and CSV).");

      const xmlText = await xmlFile.text();
      const { bank, opening, closing, iban } = parseCamt053(xmlText);

      const csvText = await csvFile.text();
      const parsed = parseCSV(csvText);
      const required = ["TxnId", "Invoice", "Counterparty", "Amount", "Currency", "BookDate", "Direction"];
      if (!required.every((c) => parsed.headers.includes(c))) throw new Error("internal_transactions.csv missing columns: " + required.join(", "));
      const internal: InternalTxn[] = parsed.rows.map((r, i) => ({
        int_id: i,
        TxnId: r["TxnId"],
        Invoice: r["Invoice"],
        Counterparty: r["Counterparty"],
        Amount: Number(r["Amount"]),
        Currency: r["Currency"],
        BookDate: r["BookDate"],
        Direction: r["Direction"],
      }));

      const { matched, bankOnly, internalOnly } = reconcile(bank, internal, {
        amountTolerance: amountTol,
        dateToleranceDays: Math.max(0, Math.floor(dateTolDays)),
      });
      const sumMovements = bank.reduce((a, x) => a + (Number(x.Amount) || 0), 0);
      const calcClosing = opening ? opening.amt + sumMovements : undefined;
      const balanceOk = closing && typeof calcClosing === "number" ? Math.abs(calcClosing - closing.amt) < 1e-6 : undefined;

      setResults({ matched, bankOnly, internalOnly, opening, closing, iban, sumMovements, calcClosing, balanceOk });
    } catch (e: any) {
      setErr(e?.message || String(e));
      setResults(null);
    } finally {
      setProcessing(false);
    }
  }

  function downloadReport() {
    if (!results) return;
    const headers = [
      "Status",
      "Bank_EndToEndId",
      "Bank_InstrId",
      "Bank_Amount",
      "Bank_Dir",
      "Bank_Date",
      "Internal_TxnId",
      "Internal_Invoice",
      "Internal_Amount",
      "Internal_Dir",
      "Internal_Date",
    ];
    const rows: Record<string, any>[] = [];
    for (const m of results.matched) {
      const b = m.bank as BankTxn;
      const it = m.int as InternalTxn;
      rows.push({
        Status: "Matched",
        Bank_EndToEndId: b.EndToEndId,
        Bank_InstrId: b.InstrId,
        Bank_Amount: b.Amount,
        Bank_Dir: b.Dir,
        Bank_Date: b.BookDate,
        Internal_TxnId: it.TxnId,
        Internal_Invoice: it.Invoice,
        Internal_Amount: it.Amount,
        Internal_Dir: it.Direction,
        Internal_Date: it.BookDate,
      });
    }
    for (const b of results.bankOnly) {
      rows.push({
        Status: "BankOnly",
        Bank_EndToEndId: b.EndToEndId,
        Bank_InstrId: b.InstrId,
        Bank_Amount: b.Amount,
        Bank_Dir: b.Dir,
        Bank_Date: b.BookDate,
      });
    }
    for (const it of results.internalOnly) {
      rows.push({
        Status: "InternalOnly",
        Internal_TxnId: it.TxnId,
        Internal_Invoice: it.Invoice,
        Internal_Amount: it.Amount,
        Internal_Dir: it.Direction,
        Internal_Date: it.BookDate,
      });
    }
    const csv = toCSV(headers, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reconciliation_report.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const dropBase =
    "min-h-[140px] rounded-2xl border border-emerald-600/40 bg-emerald-950/30 p-6 text-sm transition hover:border-emerald-400/70 hover:bg-emerald-900/30 flex flex-col items-center justify-center gap-3 text-center";

  return (
    <main className="flex-1 px-6 pb-12 pt-10">
      <header className="mx-auto max-w-5xl rounded-3xl border border-emerald-500/30 bg-emerald-900/40 p-8 shadow-xl shadow-emerald-950/40 backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/70">Reconciliation workspace</p>
            <h1 className="text-3xl font-semibold text-emerald-50 md:text-4xl">CAMT.053 Reconciliation</h1>
            <p className="max-w-2xl text-sm text-emerald-100/80">
              Drag in your bank CAMT.053 XML and internal CSV, define tolerance windows, and export a polished reconciliation report.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/30 px-5 py-4 text-sm text-emerald-100/80">
            <p className="font-medium text-emerald-100">Expected CSV Columns</p>
            <p className="mt-1 text-xs text-emerald-200/80">TxnId, Invoice, Counterparty, Amount, Currency, BookDate, Direction</p>
          </div>
        </div>
      </header>

      <section className="mx-auto mt-8 max-w-5xl space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-emerald-600/30 bg-emerald-950/30 p-6 shadow-lg shadow-emerald-950/30 backdrop-blur">
            <label className="block text-sm font-semibold text-emerald-100">Bank statement (CAMT.053 XML)</label>
            <p className="mt-1 text-xs text-emerald-200/70">Supports drag & drop or manual selection.</p>
            <DropZone accept={acceptXML} onDropFile={onDropXML} className={`${dropBase} mt-4`}>
              <span className="text-base font-medium text-emerald-100">Drop XML here</span>
              <span className="text-xs uppercase tracking-[0.25em] text-emerald-300">or</span>
              <input
                type="file"
                accept=".xml,application/xml,text/xml"
                onChange={(e) => setXmlFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-emerald-100 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500/20 file:px-3 file:py-2 file:text-xs file:font-medium file:text-emerald-100 hover:file:bg-emerald-500/30"
              />
              {xmlFile && <p className="text-xs text-emerald-200/80">Selected: {xmlFile.name}</p>}
            </DropZone>
          </div>

          <div className="rounded-3xl border border-emerald-600/30 bg-emerald-950/30 p-6 shadow-lg shadow-emerald-950/30 backdrop-blur">
            <label className="block text-sm font-semibold text-emerald-100">Internal transactions (CSV)</label>
            <p className="mt-1 text-xs text-emerald-200/70">Matches using invoice or tolerances.</p>
            <DropZone accept={acceptCSV} onDropFile={onDropCSV} className={`${dropBase} mt-4`}>
              <span className="text-base font-medium text-emerald-100">Drop CSV here</span>
              <span className="text-xs uppercase tracking-[0.25em] text-emerald-300">or</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-emerald-100 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500/20 file:px-3 file:py-2 file:text-xs file:font-medium file:text-emerald-100 hover:file:bg-emerald-500/30"
              />
              {csvFile && <p className="text-xs text-emerald-200/80">Selected: {csvFile.name}</p>}
            </DropZone>
          </div>
        </div>

        <div className="rounded-3xl border border-emerald-600/30 bg-emerald-950/30 p-6 shadow-lg shadow-emerald-950/30 backdrop-blur">
          <h2 className="text-sm font-semibold text-emerald-100">Matching parameters</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            <div>
              <label className="text-xs uppercase tracking-[0.25em] text-emerald-400">Amount tolerance</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amountTol}
                onChange={(e) => setAmountTol(parseFloat(e.target.value))}
                className="mt-2 w-full rounded-xl border border-emerald-600/40 bg-emerald-950/60 px-4 py-2 text-sm text-emerald-100 placeholder:text-emerald-300/50"
              />
              <p className="mt-2 text-xs text-emerald-200/70">Absolute currency units (e.g. 0.50 → ±0.50).</p>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.25em] text-emerald-400">Date window (days)</label>
              <input
                type="number"
                step="1"
                value={dateTolDays}
                onChange={(e) => setDateTolDays(parseInt(e.target.value || "0", 10))}
                className="mt-2 w-full rounded-xl border border-emerald-600/40 bg-emerald-950/60 px-4 py-2 text-sm text-emerald-100 placeholder:text-emerald-300/50"
              />
              <p className="mt-2 text-xs text-emerald-200/70">Maximum booking-date difference.</p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <button
                onClick={handleProcess}
                disabled={processing}
                className="w-full rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-600/40 disabled:text-emerald-100/50 md:w-auto"
              >
                {processing ? "Processing…" : "Run reconciliation"}
              </button>
              {results && (
                <button
                  onClick={downloadReport}
                  className="w-full rounded-xl border border-emerald-400/60 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200 hover:text-emerald-50 md:w-auto"
                >
                  Download report
                </button>
              )}
            </div>
          </div>
        </div>

        {err && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-900/40 p-4 text-rose-100 shadow-lg shadow-rose-900/30 backdrop-blur">
            <strong className="font-semibold">Error:</strong> {err}
          </div>
        )}

        {results && (
          <section className="space-y-6">
            <div className="rounded-3xl border border-emerald-600/30 bg-emerald-950/30 p-6 shadow-lg shadow-emerald-950/30 backdrop-blur">
              <h2 className="text-lg font-semibold text-emerald-50">Balance summary</h2>
              <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/70">IBAN</p>
                  <p className="mt-1 font-medium text-emerald-50">{results.iban || "—"}</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/70">Opening</p>
                  <p className="mt-1 font-medium text-emerald-50">
                    {results.opening?.amt?.toFixed(2)} {results.opening?.ccy || ""}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/70">Closing (reported)</p>
                  <p className="mt-1 font-medium text-emerald-50">
                    {results.closing?.amt?.toFixed(2)} {results.closing?.ccy || ""}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/70">Sum movements</p>
                  <p className="mt-1 font-medium text-emerald-50">{results.sumMovements.toFixed(2)}</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/70">Closing (calculated)</p>
                  <p className="mt-1 font-medium text-emerald-50">
                    {typeof results.calcClosing === "number" ? results.calcClosing.toFixed(2) : "—"}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-900/30 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/70">Balance status</p>
                  <p className="mt-1 font-medium text-emerald-50">
                    {results.balanceOk === undefined ? "—" : results.balanceOk ? "Balanced" : "Variance detected"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-3xl border border-emerald-600/30 bg-emerald-950/40 p-6 shadow-lg shadow-emerald-950/30 backdrop-blur">
                <h3 className="text-base font-semibold text-emerald-50">
                  Matched <span className="text-emerald-300/70">({results.matched.length})</span>
                </h3>
                <ul className="mt-4 max-h-64 space-y-3 overflow-auto pr-1 text-sm">
                  {results.matched.map((m, i) => (
                    <li key={i} className="rounded-xl border border-emerald-500/20 bg-emerald-900/40 p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-emerald-300/70">Rule</div>
                      <div className="text-emerald-100">{m.rule}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.2em] text-emerald-300/70">Invoice / E2E</div>
                      <div className="text-emerald-100">{m.bank?.EndToEndId || "—"}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.2em] text-emerald-300/70">Amount · Direction · Date</div>
                      <div className="text-emerald-100">
                        {m.bank?.Amount} {m.bank?.Dir} {m.bank?.BookDate}
                      </div>
                    </li>
                  ))}
                  {results.matched.length === 0 && <li className="text-xs text-emerald-200/70">No deterministic or fuzzy matches.</li>}
                </ul>
              </div>
              <div className="rounded-3xl border border-emerald-600/30 bg-emerald-950/40 p-6 shadow-lg shadow-emerald-950/30 backdrop-blur">
                <h3 className="text-base font-semibold text-emerald-50">
                  Bank only <span className="text-emerald-300/70">({results.bankOnly.length})</span>
                </h3>
                <ul className="mt-4 max-h-64 space-y-3 overflow-auto pr-1 text-sm">
                  {results.bankOnly.map((b) => (
                    <li key={b.bank_id} className="rounded-xl border border-emerald-500/20 bg-emerald-900/40 p-3">
                      <div className="text-emerald-100">
                        {b.Amount} {b.Ccy} · {b.Dir} · {b.BookDate}
                      </div>
                      <div className="mt-2 text-xs uppercase tracking-[0.2em] text-emerald-300/70">E2E reference</div>
                      <div className="text-emerald-100">{b.EndToEndId || "—"}</div>
                    </li>
                  ))}
                  {results.bankOnly.length === 0 && <li className="text-xs text-emerald-200/70">All bank entries reconciled.</li>}
                </ul>
              </div>
              <div className="rounded-3xl border border-emerald-600/30 bg-emerald-950/40 p-6 shadow-lg shadow-emerald-950/30 backdrop-blur">
                <h3 className="text-base font-semibold text-emerald-50">
                  Internal only <span className="text-emerald-300/70">({results.internalOnly.length})</span>
                </h3>
                <ul className="mt-4 max-h-64 space-y-3 overflow-auto pr-1 text-sm">
                  {results.internalOnly.map((it) => (
                    <li key={it.int_id} className="rounded-xl border border-emerald-500/20 bg-emerald-900/40 p-3">
                      <div className="text-emerald-100">
                        {it.Amount} {it.Currency} · {it.Direction} · {it.BookDate}
                      </div>
                      <div className="mt-2 text-xs uppercase tracking-[0.2em] text-emerald-300/70">Invoice</div>
                      <div className="text-emerald-100">{it.Invoice || "—"}</div>
                    </li>
                  ))}
                  {results.internalOnly.length === 0 && <li className="text-xs text-emerald-200/70">No unmatched internal items.</li>}
                </ul>
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

