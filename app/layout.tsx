import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";


const inter = Inter({ subsets: ["latin"], display: "swap" });


export const metadata: Metadata = {
title: {
default: "CAMT.053 Reconciliation",
template: "%s · CAMT.053 Reconciliation",
},
description: "Upload CAMT.053 XML and internal CSV, tune tolerances, and export a reconciliation report.",
icons: {
icon: [
{ url: "/favicon.svg", type: "image/svg+xml" },
{ url: "/favicon.ico", sizes: "any" },
],
shortcut: ["/favicon.ico"],
},
manifest: "/site.webmanifest", // optional if you add one later
viewport: {
width: "device-width",
initialScale: 1,
themeColor: "#0f172a",
},
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
return (
<html lang="en" className="scroll-smooth" suppressHydrationWarning>
<body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>{children}</body>
</html>
);
}