import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getConversation } from "@/lib/store";
import { sendTeamNotification } from "@/lib/team-notifications";
import type { Lead } from "@/lib/types";

declare global {
  var __medmindsClosureNotifications: Set<string> | undefined;
}

const memoryKeys = globalThis.__medmindsClosureNotifications ?? new Set<string>();
globalThis.__medmindsClosureNotifications = memoryKeys;
let sql: NeonQueryFunction<false, false> | null = null;
let initialization: Promise<void> | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

async function ensureTable() {
  const db = database();
  if (!db) return;
  initialization ??= db.query(`CREATE TABLE IF NOT EXISTS conversation_closure_notifications (
    notification_key TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).then(() => undefined);
  await initialization;
}

async function claimNotification(key: string, phone: string) {
  await ensureTable();
  const db = database();
  if (!db) {
    if (memoryKeys.has(key)) return false;
    memoryKeys.add(key);
    return true;
  }
  const rows = await db.query(`INSERT INTO conversation_closure_notifications (notification_key, phone)
    VALUES ($1,$2) ON CONFLICT (notification_key) DO NOTHING RETURNING notification_key`, [key, phone]);
  return rows.length > 0;
}

function cleanMessage(content: string) {
  return content.replace(/^\[Human: [^\]]+]\s*/, "").replace(/\s+/g, " ").trim();
}

export async function notifyConversationClosed(input: {
  lead: Lead;
  reason: "Archived" | "Converted" | "Lost lead";
  phoneNumberIdOverride?: string;
}) {
  const history = await getConversation(input.lead.phone, 40);
  const lastClient = [...history].reverse().find((message) => message.role === "user");
  const eventAnchor = lastClient?.id || lastClient?.createdAt || input.lead.createdAt;
  const notificationKey = `${input.lead.phone}:${input.reason}:${eventAnchor}`;
  if (!(await claimNotification(notificationKey, input.lead.phone))) return false;

  const highlights = history.slice(-6).map((message) => {
    const speaker = message.role === "user" ? "Client" : /^\[Human:/.test(message.content) ? "Team" : "AI";
    return `${speaker}: ${cleanMessage(message.content).slice(0, 260)}`;
  });

  const contact = input.lead.phone.startsWith("+") ? input.lead.phone : `+${input.lead.phone}`;
  const body = [
    "MedMinds conversation closed",
    `Client: ${input.lead.name || "Not provided"}`,
    `WhatsApp: ${contact}`,
    `Outcome: ${input.reason}`,
    `Status: ${input.lead.status}`,
    `Service: ${input.lead.serviceInterest || input.lead.packageName || "Not established"}`,
    `Programme: ${input.lead.programme || "Not provided"}`,
    `Institution: ${input.lead.institution || "Not provided"}`,
    `Deadline: ${input.lead.deadline || "Not provided"}`,
    `Assigned to: ${input.lead.assignedTo || "Unassigned"}`,
    input.lead.handoffReason ? `Handover/context: ${input.lead.handoffReason.replace(/^\[HUMAN TAKEOVER]\s*/, "")}` : null,
    "",
    "Recent conversation summary:",
    ...(highlights.length ? highlights : ["No conversation messages were available."])
  ].filter(Boolean).join("\n").replaceAll("—", ",");

  await sendTeamNotification({
    kind: "conversation_closed",
    body,
    phoneNumberIdOverride: input.phoneNumberIdOverride
  });
  return true;
}
