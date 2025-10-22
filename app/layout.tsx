export const metadata = { title: "CAMT.053 Reconciliation", description: "Upload CAMT.053 XML and internal CSV to reconcile" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-gray-900">{children}</body>
    </html>
  );
}

