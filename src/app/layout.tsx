import localFont from "next/font/local";
import "./styles.css";
import type { Metadata } from "next";

const atkinson = localFont({ src: [{ path: "../../public/fonts/atkinson-hyperlegible-400.woff2", weight: "400" }, { path: "../../public/fonts/atkinson-hyperlegible-700.woff2", weight: "700" }], variable: "--font-atkinson", display: "swap" });
export const metadata: Metadata = { title: "Northern Direct", description: "Direct Northern line arrivals", manifest: "/manifest.webmanifest", appleWebApp: { capable: true, title: "Northern Direct" }, icons: { apple: "/icons/icon-192.png" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en-GB"><body className={atkinson.variable}>{children}</body></html>; }
