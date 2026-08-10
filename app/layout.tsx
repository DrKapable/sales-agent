import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import "./admin-mobile.css";

export const metadata: Metadata = {
  title: "MedMinds Sales Agent",
  description: "WhatsApp sales and lead management for MedMinds Learning Centre"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return <html lang="en"><body>{children}</body></html>;
}
