import { neon } from "@neondatabase/serverless";
import { getConversation } from "@/lib/store";

type LeadLike = {
  id: string;
  phone: string;
  name?: string | null;
  status?: string | null;
  serviceInterest?: string | null;
  packageName?: string | null;
  leadScore?: number | null;
  inactiveDays?: number | null;
};

type ReviewTurn = { role: "client" | "agent"; content: string; createdAt: string | null };

function cleanContent(value: string) {
  return value
    .replace(/^\[Human:[^\]]+\]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function serviceForLead(lead: LeadLike) {
  return lead.serviceInterest || lead.packageName || null;
}

function activeCandidates(leads: LeadLike[], maxLeads: number) {
  return leads
    .filter((lead) => !["CONVERTED", "LOST LEAD"].includes(String(lead.status || "")))
    .sort((a, b) => Number(b.leadScore || 0) - Number(a.leadScore || 0) || Number(b.inactiveDays || 0) - Number(a.inactiveDays || 0))
    .slice(0, Math.max(1, Math.min(30, maxLeads)));
}

async function batchTurns(perLead: number) {
  const grouped = new Map<string, ReviewTurn[]>();
  if (!process.env.DATABASE_URL) return grouped;
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql.query(`
    WITH recent_leads AS (
      SELECT phone FROM leads ORDER BY updated_at DESC LIMIT 200
    ), ranked AS (
      SELECT m.phone,m.role,m.content,m.created_at,
             ROW_NUMBER() OVER (PARTITION BY m.phone ORDER BY m.created_at DESC) AS rn
      FROM messages m
      INNER JOIN recent_leads l ON l.phone=m.phone
    )
    SELECT phone,role,content,created_at
    FROM ranked
    WHERE rn <= $1
    ORDER BY phone,created_at
  `, [Math.max(4, Math.min(16, perLead))]);

  for (const row of rows as any[]) {
    const content = cleanContent(String(row.content || ""));
    if (!content) continue;
    const phone = String(row.phone || "");
    const list = grouped.get(phone) || [];
    list.push({
      role: String(row.role || "") === "user" ? "client" : "agent",
      content,
      createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null
    });
    grouped.set(phone, list);
  }
  return grouped;
}

export async function buildInboxConversationReview(leads: LeadLike[], maxLeads = 20, perLead = 10) {
  const selected = activeCandidates(leads, maxLeads);
  let grouped = new Map<string, ReviewTurn[]>();
  if (process.env.DATABASE_URL) {
    try {
      grouped = await batchTurns(perLead);
    } catch (error) {
      console.warn("Inbox semantic review batch read failed; using per-lead fallback", { error });
    }
  }

  if (!grouped.size) {
    await Promise.all(selected.map(async (lead) => {
      const messages = await getConversation(lead.phone, perLead);
      grouped.set(lead.phone, messages.map((message) => ({
        role: message.role === "user" ? "client" as const : "agent" as const,
        content: cleanContent(message.content),
        createdAt: message.createdAt || null
      })).filter((turn) => turn.content));
    }));
  }

  return selected.map((lead) => ({
    leadId: lead.id,
    name: lead.name || null,
    phone: lead.phone,
    status: String(lead.status || ""),
    service: serviceForLead(lead),
    leadScore: Number(lead.leadScore || 0),
    inactiveDays: Number(lead.inactiveDays || 0),
    turns: (grouped.get(lead.phone) || []).slice(-Math.max(4, Math.min(16, perLead)))
  })).filter((conversation) => conversation.turns.length > 0);
}
