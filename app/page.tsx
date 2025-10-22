"use client";

import React, { useCallback, useMemo, useState } from "react";
import DropZone from "@/components/DropZone";
import { parseCSV, toCSV } from "@/lib/csv";
import { parseCamt053, type BankTxn } from "@/lib/camt";
import { reconcile, type InternalTxn } from "@/lib/reconcile";

// ---- small UI helpers (no extra deps) --------------------------------------
const fmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMoney = (n: number | undefined | null, ccy?: string | null) =>
  n === undefined || n === null || Number.isNaN(n) ? "—" : `${fmt.format(Number(n))}${ccy ? ` ${ccy}` : ""}`;

function Badge({ children, tone = "slate" as "slate" | "sky" | "rose" | "emerald" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    sky: "bg-sky-50 text-sky-700 ring-sky-200",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${tones[tone]}`}>{children}</span>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SectionCard({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-xl shadow-slate-200/60">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

// ---- page component ---------------------------------------------------------
export default function Page() {
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [amountTol, setAmountTol] = useState<number>(0.01);
  const [dateTolDays, setDateTolDays] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"matched" | "bank" | "internal">("matched");

  const [results, setResults] = useState<null | {
    matched: any[];
    bankOnly: BankTxn[];
    internalOnly: InternalTxn[];
    opening?: { amt: number; ccy: string | null };
    closing?: { amt: number; ccy: string | null };
    iban: string | null;
    sumMovements: number;
    calcClosing?: number;
    balanceOk?: boolean;
  }>(null);

  const acceptXML = (f: File) => f.type.includes("xml") || f.name.toLowerCase().endsWith(".xml");
  const acceptCSV = (f: File) => f.type.includes("csv") || f.name.toLowerCase().endsWith(".csv");

  const onDropXML = useCallback((f: File) => setXmlFile(f), []);
  const onDropCSV = useCallback((f: File) => setCsvFile(f), []);

  const resetAll = useCallback(() => {
    setXmlFile(null);
    setCsvFile(null);
    setErr(null);
    setResults(null);
    setActiveTab("matched");
  }, []);

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
      if (!required.every((c) => parsed.headers.includes(c))) {
        throw new Error("internal_transactions.csv missing columns: " + required.join(", "));
      }
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
      setActiveTab("matched");
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
    "min-h-[140px] rounded-2xl border border-slate-200/80 bg-white/70 p-6 text-sm transition hover:border-sky-400 hover:shadow-lg hover:shadow-sky-100 flex flex-col items-center justify-center gap-3 text-center";

  const counts = useMemo(() => ({
    matched: results?.matched.length ?? 0,
    bank: results?.bankOnly.length ?? 0,
    internal: results?.internalOnly.length ?? 0,
  }), [results]);

  return (
    <main className="min-h-dvh bg-slate-50 text-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white">₹</div>
            <div className="text-sm font-semibold">CAMT.053 Reconciliation</div>
            <Badge>GUI</Badge>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={resetAll} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">Reset</button>
            {results && (
              <button onClick={downloadReport} className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white shadow hover:bg-slate-800">Download report</button>
            )}
          </div>
        </div>
      </header>

      {/* Hero area */}
      <section className="mx-auto max-w-6xl px-6 pt-10">
        <div className="relative overflow-hidden rounded-[32px] border border-white/60 bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#1d4ed8] p-[1px] shadow-2xl shadow-indigo-200/50">
          <div className="relative rounded-[31px] bg-gradient-to-br from-[#1f2a57] via-[#1b356b] to-[#102042]">
            <div className="absolute -right-24 -top-24 h-60 w-60 rounded-full bg-sky-400/30 blur-3xl" />
            <div className="absolute -left-16 -bottom-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="relative grid gap-8 p-10 md:grid-cols-[1.4fr_1fr] md:items-end">
              <div className="space-y-5">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-slate-200">Platform</span>
                <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">Treasury Reconciliation Workspace</h1>
                <p className="max-w-xl text-sm leading-relaxed text-slate-200/90">
                  Import CAMT.053 statements, join with internal ledgers, and export a clean audit-ready CSV. Drag & drop uploads, tolerance controls, and instant summaries.
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-slate-200/85">
                  <Badge tone="sky">Drag & drop</Badge>
                  <Badge tone="emerald">Tolerance controls</Badge>
                  <Badge>CSV export</Badge>
                </div>
              </div>
              <div className="w-full rounded-3xl border border-white/20 bg-white/15 p-6 text-sm text-white shadow-2xl shadow-indigo-500/20 backdrop-blur">
                <p className="text-sm font-semibold tracking-wide text-white/90">Expected CSV Columns</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-100/85">TxnId, Invoice, Counterparty, Amount, Currency, BookDate, Direction</p>
                <ul className="mt-4 space-y-2 text-xs text-slate-100/80">
                  <li>• One row per internal ledger entry</li>
                  <li>• Signed amounts (negative for debits if applicable)</li>
                  <li>• ISO dates (YYYY-MM-DD)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Uploads & Params */}
      <section className="mx-auto mt-10 max-w-6xl space-y-8 px-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Bank statement (CAMT.053 XML)">
            <p className="text-xs text-slate-500">Drag & drop or choose a file.</p>
            <DropZone accept={acceptXML} onDropFile={onDropXML} className={`${dropBase} mt-4`}>
              <span className="text-base font-semibold text-slate-900">Drop XML here</span>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-400">or</span>
              <input
                type="file"
                accept=".xml,application/xml,text/xml"
                onChange={(e) => setXmlFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-700"
              />
              {xmlFile && <p className="text-xs text-slate-500">Selected: {xmlFile.name}</p>}
            </DropZone>
          </SectionCard>

          <SectionCard title="Internal transactions (CSV)">
            <p className="text-xs text-slate-500">Matched by invoice or tolerances.</p>
            <DropZone accept={acceptCSV} onDropFile={onDropCSV} className={`${dropBase} mt-4`}>
              <span className="text-base font-semibold text-slate-900">Drop CSV here</span>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-400">or</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-700"
              />
              {csvFile && <p className="text-xs text-slate-500">Selected: {csvFile.name}</p>}
            </DropZone>
          </SectionCard>
        </div>

        <SectionCard
          title="Matching parameters"
          right={
            <div className="flex items-center gap-2">
              <button
                onClick={handleProcess}
                disabled={processing || !xmlFile || !csvFile}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {processing ? "Processing…" : "Run reconciliation"}
              </button>
            </div>
          }
        >
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <label className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Amount tolerance</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amountTol}
                onChange={(e) => setAmountTol(parseFloat(e.target.value))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-300"
              />
              <p className="mt-2 text-xs text-slate-500">Absolute units (e.g. 0.50 → ±0.50).</p>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Date window (days)</label>
              <input
                type="number"
                step="1"
                value={dateTolDays}
                onChange={(e) => setDateTolDays(parseInt(e.target.value || "0", 10))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-300"
              />
              <p className="mt-2 text-xs text-slate-500">Maximum booking-date difference.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:place-items-end">
              <button onClick={resetAll} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100">Reset</button>
              {results && (
                <button onClick={downloadReport} className="rounded-xl border border-slate-900/20 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow hover:border-slate-900/40 hover:text-slate-900">Download report</button>
              )}
            </div>
          </div>
        </SectionCard>

        {err && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 shadow-lg shadow-rose-100">
            <strong className="font-semibold">Error:</strong> {err}
          </div>
        )}

        {results && (
          <>
            {/* Summary cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <Stat label="Opening balance" value={formatMoney(results.opening?.amt, results.opening?.ccy)} />
              <Stat label="Sum movements" value={formatMoney(results.sumMovements)} />
              <Stat label="Closing (reported)" value={formatMoney(results.closing?.amt, results.closing?.ccy)} />
              <Stat label="Closing (calculated)" value={formatMoney(results.calcClosing, results.closing?.ccy)} />
              <Stat label="IBAN" value={results.iban || "—"} />
              <Stat
                label="Balance status"
                value={
                  results.balanceOk === undefined ? (
                    <Badge>—</Badge>
                  ) : results.balanceOk ? (
                    <Badge tone="emerald">Balanced</Badge>
                  ) : (
                    <Badge tone="rose">Variance detected</Badge>
                  )
                }
              />
            </div>

            {/* Tabs */}
            <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-2">
              <div className="flex gap-2">
                {([
                  { key: "matched", label: `Matched (${counts.matched})` },
                  { key: "bank", label: `Bank only (${counts.bank})` },
                  { key: "internal", label: `Internal only (${counts.internal})` },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`${activeTab === t.key ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"} rounded-xl px-3 py-1.5 text-sm font-medium transition`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-200">
                {/* Table header */}
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      {activeTab === "matched" ? (
                        <>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Invoice / E2E</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Amount</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Direction</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Rule</th>
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Reference</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Amount</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Direction</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {activeTab === "matched" && results.matched.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-400">No deterministic or fuzzy matches.</td>
                      </tr>
                    )}
                    {activeTab === "matched" &&
                      results.matched.map((m: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2">{m.bank?.EndToEndId || "—"}</td>
                          <td className="px-3 py-2">{formatMoney(m.bank?.Amount)}</td>
                          <td className="px-3 py-2">{m.bank?.Dir || "—"}</td>
                          <td className="px-3 py-2">{m.bank?.BookDate || "—"}</td>
                          <td className="px-3 py-2"><Badge tone="sky">{m.rule}</Badge></td>
                        </tr>
                      ))}

                    {activeTab === "bank" && results.bankOnly.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-400">All bank entries reconciled.</td>
                      </tr>
                    )}
                    {activeTab === "bank" &&
                      results.bankOnly.map((b) => (
                        <tr key={b.bank_id} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2">{b.EndToEndId || "—"}</td>
                          <td className="px-3 py-2">{formatMoney(b.Amount, b.Ccy)}</td>
                          <td className="px-3 py-2">{b.Dir || "—"}</td>
                          <td className="px-3 py-2">{b.BookDate || "—"}</td>
                        </tr>
                      ))}

                    {activeTab === "internal" && results.internalOnly.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-400">No unmatched internal items.</td>
                      </tr>
                    )}
                    {activeTab === "internal" &&
                      results.internalOnly.map((it) => (
                        <tr key={it.int_id} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2">{it.Invoice || "—"}</td>
                          <td className="px-3 py-2">{formatMoney(it.Amount, it.Currency)}</td>
                          <td className="px-3 py-2">{it.Direction || "—"}</td>
                          <td className="px-3 py-2">{it.BookDate || "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      <footer className="mt-16 border-t border-slate-200/80 bg-white/60 py-6 text-center text-xs text-slate-500">
        CAMT.053 Reconciliation • Generated CSV is for guidance only – validate before posting to ERP.
      </footer>
    </main>
  );
}
