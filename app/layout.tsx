export const metadata = { title: "CAMT.053 Reconciliation", description: "Upload CAMT.053 XML and internal CSV to reconcile" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-transparent text-emerald-50">
        <div className="flex min-h-dvh flex-col">{children}</div>
      </body>
    </html>
  );
}
