import { neon } from "@neondatabase/serverless";
import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { archiveChat, deleteAllChats, deleteChat, listArchivedLeads, restoreChat } from "@/lib/chat-lifecycle";
import { notifyConversationClosed } from "@/lib/closure-summary";
import { getOrCreateLead, listLeads } from "@/lib/store";

const targetedActionSchema = z.object({
  phone: z.string().trim().min(1).max(160).optional(),
  leadId: z.string().trim().min(1).max(160).optional(),
  action: z.enum(["archive", "restore", "delete"])
}).refine((value) => Boolean(value.phone || value.leadId), {
  message: "A client identifier is required."
});

const deleteAllActionSchema = z.object({
  action: z.literal("delete_all"),
  confirmation: z.literal("DELETE ALL CLIENTS")
});

const actionSchema = z.union([targetedActionSchema, deleteAllActionSchema]);

function normalizedDigits(value: string | undefined) {
  if (!value) return "";
  const raw = value.split("·")[0]?.trim() || value.trim();
  return raw.replace(/\D/g, "");
}

async function resolveLead(input: { phone?: string; leadId?: string }) {
  const leads = await listLeads();

  if (input.leadId) {
    const byId = leads.find((lead) => lead.id === input.leadId);
    if (byId) return byId;
  }

  const raw = input.phone?.split("·")[0]?.trim() || input.phone?.trim() || "";
  if (raw) {
    const exact = leads.find((lead) => lead.phone === raw);
    if (exact) return exact;
  }

  const digits = normalizedDigits(input.phone);
  if (digits) {
    const byDigits = leads.find((lead) => lead.phone.replace(/\D/g, "") === digits);
    if (byDigits) return byDigits;

    // Be tolerant of local/international formatting differences (for example 0977... vs 260977...).
    const suffix = digits.slice(-9);
    if (suffix.length === 9) {
      const suffixMatches = leads.filter((lead) => lead.phone.replace(/\D/g, "").endsWith(suffix));
      if (suffixMatches.length === 1) return suffixMatches[0];
    }
  }

  // listLeads is intentionally capped for the inbox. Lifecycle operations must still work
  // for a valid client outside that window, so fall back to a direct database lookup.
  if (!process.env.DATABASE_URL) return null;
  const db = neon(process.env.DATABASE_URL);

  if (input.leadId) {
    const rows = await db.query(`SELECT phone FROM leads WHERE id=$1 LIMIT 1`, [input.leadId]);
    const phone = rows[0]?.phone ? String(rows[0].phone) : "";
    if (phone) return getOrCreateLead(phone, "simulator");
  }

  if (!digits) return null;
  const suffix = digits.slice(-9);
  const rows = await db.query(
    `SELECT phone,
      CASE WHEN regexp_replace(phone, '[^0-9]', '', 'g')=$1 THEN 0 ELSE 1 END AS match_rank
     FROM leads
     WHERE regexp_replace(phone, '[^0-9]', '', 'g')=$1
        OR ($2 <> '' AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 9)=$2)
     ORDER BY match_rank ASC, updated_at DESC
     LIMIT 2`,
    [digits, suffix.length === 9 ? suffix : ""]
  );

  if (!rows.length) return null;
  const exactRows = rows.filter((row) => Number(row.match_rank) === 0);
  if (exactRows.length) return getOrCreateLead(String(exactRows[0].phone), "simulator");
  if (rows.length === 1) return getOrCreateLead(String(rows[0].phone), "simulator");
  return null;
}

export async function GET() {
  return NextResponse.json({ chats: await listArchivedLeads() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    console.warn("Invalid chat lifecycle action", { body, issues: parsed.error.issues });
    return NextResponse.json({ error: "Invalid chat action. Refresh the inbox and try again." }, { status: 400 });
  }

  if (parsed.data.action === "delete_all") {
    try {
      const result = await deleteAllChats();
      return NextResponse.json({ ok: true, action: "delete_all", deletedClients: result.deletedClients });
    } catch (error) {
      console.error("Bulk client deletion failed", { error });
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete client records." }, { status: 500 });
    }
  }

  const { action } = parsed.data;
  const lead = await resolveLead(parsed.data);
  if (!lead) {
    const digits = normalizedDigits(parsed.data.phone);
    console.warn("Chat lifecycle client lookup failed", {
      action,
      hasLeadId: Boolean(parsed.data.leadId),
      phoneSuffix: digits ? digits.slice(-4) : null
    });
    return NextResponse.json({ error: "Client could not be found. Refresh the inbox and try again." }, { status: 404 });
  }

  try {
    if (action === "archive") {
      const archivedAt = await archiveChat(lead.phone);
      after(async () => {
        try {
          await notifyConversationClosed({ lead, reason: "Archived" });
        } catch (error) {
          console.error("Archived chat closure notification failed", { phoneSuffix: lead.phone.slice(-4), error });
        }
      });
      return NextResponse.json({ ok: true, action, archivedAt });
    }
    if (action === "restore") {
      await restoreChat(lead.phone);
      return NextResponse.json({ ok: true, action });
    }
    const result = await deleteChat(lead.phone);
    return NextResponse.json({ ok: true, action, deletedClients: result.deletedClients });
  } catch (error) {
    console.error("Chat lifecycle action failed", { action, phoneSuffix: lead.phone.slice(-4), error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update this chat." }, { status: 500 });
  }
}
