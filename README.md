# CAMT.053 Reconciliation GUI (Next.js)
The GUI is designed to present the machine-readable CAMT.053 data in a user-friendly, visual format, replacing manual data entry and complex file parsing. 
Upload/drag a CAMT.053 XML + internal CSV, set tolerances, and download a reconciliation report.

## Quickstart
```bash
pnpm i   # or npm i / yarn
pnpm dev # or npm run dev / yarn dev
```

Then open [http://localhost:3000](http://localhost:3000)

### Expected CSV Columns

`TxnId, Invoice, Counterparty, Amount, Currency, BookDate, Direction`

### Build

```bash
pnpm build && pnpm start
```

