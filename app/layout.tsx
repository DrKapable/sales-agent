import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedMinds Sales Agent",
  description: "WhatsApp sales and lead management for MedMinds Learning Centre"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

