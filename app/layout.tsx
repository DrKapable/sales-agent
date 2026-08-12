import type { Metadata } from "next";
import { connection } from "next/server";
import { MobileAdminEnhancer } from "@/components/mobile-admin-enhancer";
import "./globals.css";
import "./admin-mobile.css";
import "./admin-mobile-v4.css";
import "./admin-mobile-v5.css";
import "./admin-mobile-v6.css";
import "./admin-mobile-v7.css";
import "./brand-v2.css";
import "./brand-v2-fix.css";
import "./public-chat-v2.css";

export const metadata: Metadata = {
  title: "MedMinds Learning Centre",
  description: "Medical learning, research support, tutorials, courses, software and digital solutions from MedMinds Learning Centre."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return <html lang="en"><body><MobileAdminEnhancer />{children}</body></html>;
}
