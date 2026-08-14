import type { Metadata } from "next";
import { connection } from "next/server";
import { ChatRichTextEnhancer } from "@/components/chat-rich-text-enhancer";
import { ClientRecordManagementEnhancer } from "@/components/client-record-management-enhancer";
import { MobileAdminEnhancer } from "@/components/mobile-admin-enhancer";
import "./globals.css";
import "./admin-mobile.css";
import "./admin-mobile-v4.css";
import "./admin-mobile-v5.css";
import "./admin-mobile-v6.css";
import "./admin-mobile-v7.css";
import "./admin-mobile-v8.css";
import "./brand-v2.css";
import "./brand-v2-fix.css";
import "./public-chat-v2.css";

export const metadata: Metadata = {
  title: "MedMinds Learning Centre",
  description: "Medical learning, research support, tutorials, courses, software and digital solutions from MedMinds Learning Centre.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/pwa-icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/pwa-icon-512.png", type: "image/png", sizes: "512x512" }
    ],
    apple: [{ url: "/pwa-icon-192.png", type: "image/png", sizes: "192x192" }]
  },
  appleWebApp: {
    capable: true,
    title: "MedMinds Agent",
    statusBarStyle: "default"
  }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return <html lang="en"><head><meta name="theme-color" content="#203952" /></head><body><MobileAdminEnhancer /><ClientRecordManagementEnhancer /><ChatRichTextEnhancer />{children}</body></html>;
}
