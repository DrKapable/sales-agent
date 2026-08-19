import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminDocumentsV2 } from "@/components/admin-documents-v2";
import { AgentIdentityEnhancer } from "@/components/agent-identity-enhancer";
import { BusinessPercentageEnhancer } from "@/components/business-percentage-enhancer";
import { ChatDeliveryTicksEnhancer } from "@/components/chat-delivery-ticks-enhancer";
import { ChatLifecycleReliabilityEnhancer } from "@/components/chat-lifecycle-reliability-enhancer";
import { ChatRichTextEnhancer } from "@/components/chat-rich-text-enhancer";
import { ClientAttachmentEnhancer } from "@/components/client-attachment-enhancer";
import { ClientRecordManagementEnhancer } from "@/components/client-record-management-enhancer";
import { ConversationDocumentsEnhancer } from "@/components/conversation-documents-enhancer";
import { MobileAdminEnhancer } from "@/components/mobile-admin-enhancer";
import { PwaSplash } from "@/components/pwa-splash";
import "./globals.css";
import "./admin-mobile.css";
import "./admin-mobile-v4.css";
import "./admin-mobile-v5.css";
import "./admin-mobile-v6.css";
import "./admin-mobile-v7.css";
import "./admin-mobile-v8.css";
import "./admin-documents.css";
import "./admin-attachments.css";
import "./admin-conversation-documents.css";
import "./brand-v2.css";
import "./brand-v2-fix.css";
import "./home-hero-generated.css";
import "./public-chat-v2.css";
import "./admin-chat-clean.css";
import "./pwa-splash.css";
import "./business-analytics-mobile-fix.css";

export const metadata: Metadata = {
  title: "MedMinds Learning Centre",
  description: "Medical learning, research support, tutorials, courses, software and digital solutions from MedMinds Learning Centre.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/pwa-icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/pwa-icon-512.png", type: "image/png", sizes: "512x512" }
    ],
    shortcut: [{ url: "/favicon-32.png", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/pwa-icon-192.png", type: "image/png", sizes: "192x192" }]
  },
  appleWebApp: {
    capable: true,
    title: "MedMinds Agent",
    statusBarStyle: "default"
  }
};

// Admin document enhancers are mounted at the root so the active client conversation can render shared files immediately.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return <html lang="en"><head><meta name="theme-color" content="#203952" /></head><body><PwaSplash /><MobileAdminEnhancer /><BusinessPercentageEnhancer /><ClientRecordManagementEnhancer /><ChatLifecycleReliabilityEnhancer /><AdminDocumentsV2 /><ConversationDocumentsEnhancer /><ClientAttachmentEnhancer /><ChatRichTextEnhancer /><ChatDeliveryTicksEnhancer /><AgentIdentityEnhancer />{children}</body></html>;
}
