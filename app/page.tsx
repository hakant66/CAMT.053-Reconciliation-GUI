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
      setErr(null); setProcessing(true);
      if (!xmlFile || !csvFile) throw new Error("Please select both files (XML and CSV).");

      const xmlText = await xmlFile.text();
      const { bank, opening, closing, iban } = parseCamt053(xmlText);

      const csvText = await csvFile.text();
      const parsed = parseCSV(csvText);
      const required = ["TxnId","Invoice","Counterparty","Amount","Currency","BookDate","Direction"];
      if (!required.every((c) => parsed.headers.includes(c))) throw new Error("internal_transactions.csv missing columns: " + required.join(", "));
      const internal: InternalTxn[] = parsed.rows.map((r, i) => ({ int_id:i, TxnId:r["TxnId"], Invoice:r["Invoice"], Counterparty:r["Counterparty"], Amount:Number(r["Amount"]), Currency:r["Currency"], BookDate:r["BookDate"], Direction:r["Direction"] }));

      const { matched, bankOnly, internalOnly } = reconcile(bank, internal, { amountTolerance: amountTol, dateToleranceDays: Math.max(0, Math.floor(dateTolDays)) });
      const sumMovements = bank.reduce((a, x) => a + (Number(x.Amount)||0), 0);
      const calcClosing = opening ? opening.amt + sumMovements : undefined;
      const balanceOk = closing && typeof calcClosing === "number" ? Math.abs(calcClosing - closing.amt) < 1e-6 : undefined;

      setResults({ matched, bankOnly, internalOnly, opening, closing, iban, sumMovements, calcClosing, balanceOk });
    } catch (e: any) { setErr(e?.message || String(e)); setResults(null); }
    finally { setProcessing(false); }
  }

  function downloadReport() {
    if (!results) return;
    const headers = ["Status","Bank_EndToEndId","Bank_InstrId","Bank_Amount","Bank_Dir","Bank_Date","Internal_TxnId","Internal_Invoice","Internal_Amount","Internal_Dir","Internal_Date"];
    const rows: Record<string, any>[] = [];
    for (const m of results.matched) { const b = m.bank as BankTxn; const it = m.int as InternalTxn; rows.push({ Status:"Matched", Bank_EndToEndId:b.EndToEndId, Bank_InstrId:b.InstrId, Bank_Amount:b.Amount, Bank_Dir:b.Dir, Bank_Date:b.BookDate, Internal_TxnId:it.TxnId, Internal_Invoice:it.Invoice, Internal_Amount:it.Amount, Internal_Dir:it.Direction, Internal_Date:it.BookDate }); }
    for (const b of results.bankOnly) { rows.push({ Status:"BankOnly", Bank_EndToEndId:b.EndToEndId, Bank_InstrId:b.InstrId, Bank_Amount:b.Amount, Bank_Dir:b.Dir, Bank_Date:b.BookDate }); }
    for (const it of results.internalOnly) { rows.push({ Status:"InternalOnly", Internal_TxnId:it.TxnId, Internal_Invoice:it.Invoice, Internal_Amount:it.Amount, Internal_Dir:it.Direction, Internal_Date:it.BookDate }); }
    const csv = toCSV(headers, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "reconciliation_report.csv"; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  const dropBase = "p-4 border-2 border-dashed rounded-2xl text-sm flex flex-col items-center justify-center gap-2 min-h-[120px]";

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold mb-2">CAMT.053 Reconciliation</h1>
      <p className="text-sm text-gray-600 mb-6">Upload or drag & drop a <code>sample_camt_053.xml</code> and an <code>internal_transactions.csv</code>, then generate <code>reconciliation_report.csv</code>. Tolerances supported.</p>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div className="p-4 border rounded-2xl">
          <label className="block text-sm mb-2 font-medium">Bank statement (CAMT.053 XML)</label>
          <DropZone accept={acceptXML} onDropFile={onDropXML} className={`${dropBase} ${!xmlFile ? "bg-gray-50" : "bg-green-50 border-green-300"}`}>
            <span>Drag & drop XML here</span>
            <span className="text-gray-500">or</span>
            <input type="file" accept=".xml,application/xml,text/xml" onChange={(e) => setXmlFile(e.target.files?.[0] || null)} className="block w-full text-xs" />
            {xmlFile && <p className="text-xs mt-1">Selected: {xmlFile.name}</p>}
          </DropZone>
        </div>
        <div className="p-4 border rounded-2xl">
          <label className="block text-sm mb-2 font-medium">Internal transactions (CSV)</label>
          <DropZone accept={acceptCSV} onDropFile={onDropCSV} className={`${dropBase} ${!csvFile ? "bg-gray-50" : "bg-green-50 border-green-300"}`}>
            <span>Drag & drop CSV here</span>
            <span className="text-gray-500">or</span>
            <input type="file" accept=".csv,text/csv" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} className="block w-full text-xs" />
            {csvFile && <p className="text-xs mt-1">Selected: {csvFile.name}</p>}
          </DropZone>
        </div>
      </div>

      <div className="p-4 border rounded-2xl mb-4 grid sm:grid-cols-3 gap-4 items-end">
        <div>
          <label className="block text-sm mb-1 font-medium">Amount tolerance</label>
          <input type="number" inputMode="decimal" step="0.01" className="w-full border rounded-xl px-3 py-2 text-sm" value={amountTol} onChange={(e) => setAmountTol(parseFloat(e.target.value))} />
          <p className="text-xs text-gray-500 mt-1">Absolute currency units (e.g., 0.50 → ±0.50).</p>
        </div>
        <div>
          <label className="block text-sm mb-1 font-medium">Date window (days)</label>
          <input type="number" step="1" className="w-full border rounded-xl px-3 py-2 text-sm" value={dateTolDays} onChange={(e) => setDateTolDays(parseInt(e.target.value || "0", 10))} />
          <p className="text-xs text-gray-500 mt-1">Max booking-date difference.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleProcess} disabled={processing} className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50 w-full">{processing ? "Processing…" : "Process"}</button>
          {results && (<button onClick={downloadReport} className="px-4 py-2 rounded-xl border w-full">Download report</button>)}
        </div>
      </div>

      {err && (<div className="p-3 rounded-xl bg-red-50 text-red-700 mb-6"><strong>Error:</strong> {err}</div>)}

      {results && (
        <section className="space-y-6">
          <div className="p-4 border rounded-2xl">
            <h2 className="font-semibold mb-2">Balance summary</h2>
            <div className="grid sm:grid-cols-3 gap-2 text-sm">
              <div><span className="text-gray-500">IBAN:</span> {results.iban || "—"}</div>
              <div><span className="text-gray-500">Opening:</span> {results.opening?.amt?.toFixed(2)} {results.opening?.ccy || ""}</div>
              <div><span className="text-gray-500">Closing (reported):</span> {results.closing?.amt?.toFixed(2)} {results.closing?.ccy || ""}</div>
              <div><span className="text-gray-500">Sum movements:</span> {results.sumMovements.toFixed(2)}</div>
              <div><span className="text-gray-500">Closing (calculated):</span> {typeof results.calcClosing === "number" ? results.calcClosing.toFixed(2) : "—"}</div>
              <div><span className="text-gray-500">Balance OK:</span> {results.balanceOk === undefined ? "—" : results.balanceOk ? "Yes" : "No"}</div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="p-4 border rounded-2xl">
              <h3 className="font-semibold mb-2">Matched <span className="text-gray-500">({results.matched.length})</span></h3>
              <ul className="space-y-2 text-sm max-h-64 overflow-auto">
                {results.matched.map((m, i) => (
                  <li key={i} className="border rounded-lg p-2">
                    <div><span className="text-gray-500">Rule:</span> {m.rule}</div>
                    <div><span className="text-gray-500">EndToEndId / Invoice:</span> {m.bank?.EndToEndId || "—"}</div>
                    <div><span className="text-gray-500">Amount/Dir/Date:</span> {m.bank?.Amount} {m.bank?.Dir} {m.bank?.BookDate}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 border rounded-2xl">
              <h3 className="font-semibold mb-2">Bank only <span className="text-gray-500">({results.bankOnly.length})</span></h3>
              <ul className="space-y-2 text-sm max-h-64 overflow-auto">
                {results.bankOnly.map((b) => (
                  <li key={b.bank_id} className="border rounded-lg p-2">
                    <div>{b.Amount} {b.Ccy} · {b.Dir} · {b.BookDate}</div>
                    <div className="text-gray-500">E2E: {b.EndToEndId || "—"}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 border rounded-2xl">
              <h3 className="font-semibold mb-2">Internal only <span className="text-gray-500">({results.internalOnly.length})</span></h3>
              <ul className="space-y-2 text-sm max-h-64 overflow-auto">
                {results.internalOnly.map((it) => (
                  <li key={it.int_id} className="border rounded-lg p-2">
                    <div>{it.Amount} {it.Currency} · {it.Direction} · {it.BookDate}</div>
                    <div className="text-gray-500">Invoice: {it.Invoice || "—"}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

