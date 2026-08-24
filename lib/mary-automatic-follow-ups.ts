import { neon } from "@neondatabase/serverless";
import { addMessage, listLeads, updateLead } from "@/lib/store";
import { getApprovedMetaTemplateInventory, sendApprovedMetaTemplate, type MetaTemplate } from "@/lib/meta-templates";
import { recordOutgoingMessageAccepted } from "@/lib/message-delivery";

const MAX_AUTOMATED_STEPS = 3;
const NEXT_STEP_HOURS = 24;

type LeadLike = Awaited<ReturnType<typeof listLeads>>[number];

function db() {
  return process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
}

function numericVariableCount(text = "") {
  const values = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return values.length ? Math.max(...values) : 0;
}

function usableTemplate(template: MetaTemplate) {
  for (const component of template.components || []) {
    if (component.type === "HEADER" && component.format && component.format !== "TEXT") return false;
    if (!["HEADER", "BODY", "FOOTER", "BUTTONS"].includes(component.type)) return false;
    if (component.type === "BUTTONS") {
      const raw = JSON.stringify(component);
      if (/\{\{\d+\}\}/.test(raw)) return false;
    }
  }
  const header = template.components.find((item) => item.type === "HEADER");
  const body = template.components.find((item) => item.type === "BODY");
  return numericVariableCount(header?.text) <= 3 && numericVariableCount(body?.text) <= 3;
}

function templateScore(template: MetaTemplate, lead: LeadLike) {
  const text = `${template.name} ${template.components.map((item) => item.text || "").join(" ")}`.toLowerCase();
  let score = 0;
  if (/follow[_ -]?up|followup|checking in|check in/.test(text)) score += 100;
  if (/reminder|continue|still interested|next step/.test(text)) score += 45;
  if (lead.status === "PAYMENT PENDING" && /payment|invoice|pay/.test(text)) score += 35;
  if (/medminds|mary/.test(text)) score += 10;
  return score;
}

function chooseTemplate(templates: MetaTemplate[], lead: LeadLike) {
  return templates.filter(usableTemplate).sort((a, b) => templateScore(b, lead) - templateScore(a, lead) || a.name.localeCompare(b.name))[0] || null;
}

function variablesForLead(lead: LeadLike) {
  const firstName = lead.name?.trim().split(/\s+/)[0] || "there";
  const service = lead.serviceInterest || lead.packageName || "your MedMinds enquiry";
  const deadline = lead.deadline || "your preferred timeline";
  return [firstName, service, deadline];
}

function templateComponents(template: MetaTemplate, lead: LeadLike) {
  const values = variablesForLead(lead);
  const components: Array<{ type: "header" | "body"; parameters: Array<{ type: "text"; text: string }> }> = [];
  const header = template.components.find((item) => item.type === "HEADER");
  const body = template.components.find((item) => item.type === "BODY");
  const headerCount = numericVariableCount(header?.text);
  const bodyCount = numericVariableCount(body?.text);
  if (headerCount) components.push({ type: "header", parameters: values.slice(0, headerCount).map((text) => ({ type: "text", text })) });
  if (bodyCount) components.push({ type: "body", parameters: values.slice(0, bodyCount).map((text) => ({ type: "text", text })) });
  return components;
}

export async function runMaryAutomaticFollowUps() {
  const sql = db();
  if (!sql) return { checked: 0, sent: 0, failed: 0, skipped: "database_not_configured" };

  const inventory = await getApprovedMetaTemplateInventory();
  if (!inventory.templates.length) return { checked: 0, sent: 0, failed: 0, skipped: "no_approved_production_templates" };

  const leads = await listLeads();
  const leadByPhone = new Map(leads.map((lead) => [lead.phone, lead]));
  const rows = await sql.query(`SELECT * FROM human_follow_up_tasks WHERE status='PENDING' AND source='MARY' AND scheduled_at <= NOW() ORDER BY scheduled_at ASC LIMIT 25`);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const id = String(row.id);
    const phone = String(row.phone);
    const step = Math.max(1, Number(row.sequence_step || 1));
    const lead = leadByPhone.get(phone);

    if (!lead || ["CONVERTED", "LOST LEAD"].includes(lead.status)) {
      await sql.query(`UPDATE human_follow_up_tasks SET status='DROPPED',completed_at=NOW(),completed_by='Mary Kaunda',channel='WHATSAPP',summary=$2,transport_status='SKIPPED',updated_at=NOW() WHERE id=$1 AND status='PENDING'`, [id, lead ? `Automatic follow-up cancelled because lead is ${lead.status}.` : "Automatic follow-up cancelled because the client record is unavailable."]);
      if (lead?.followUpAt) await updateLead(phone, { followUpAt: null }).catch(() => undefined);
      continue;
    }

    if (step > MAX_AUTOMATED_STEPS) {
      await sql.query(`UPDATE human_follow_up_tasks SET source='MANUAL',reason=COALESCE(reason,'') || ' · Mary completed the automatic follow-up sequence; human review required.',transport_status='HUMAN REVIEW REQUIRED',updated_at=NOW() WHERE id=$1 AND status='PENDING'`, [id]);
      continue;
    }

    const template = chooseTemplate(inventory.templates, lead);
    if (!template) {
      failed += 1;
      await sql.query(`UPDATE human_follow_up_tasks SET transport_status='WAITING FOR COMPATIBLE APPROVED TEMPLATE',updated_at=NOW() WHERE id=$1`, [id]);
      continue;
    }

    try {
      const components = templateComponents(template, lead);
      const result = await sendApprovedMetaTemplate({ phone, name: template.name, language: template.language, components });
      const chatLabel = `[Mary automatic follow-up · Meta template: ${template.name}]`;
      await addMessage(phone, "assistant", chatLabel, result.messageId);
      await recordOutgoingMessageAccepted({ messageId: result.messageId, phone }).catch(() => undefined);

      const nextAt = step < MAX_AUTOMATED_STEPS ? new Date(Date.now() + NEXT_STEP_HOURS * 60 * 60 * 1000) : null;
      await sql.query(`UPDATE human_follow_up_tasks SET status='COMPLETED',completed_at=NOW(),completed_by='Mary Kaunda',channel='WHATSAPP',summary=$2,outcome='REACHED_CONTINUE',message=$3,transport_status=$4,next_scheduled_at=$5,updated_at=NOW() WHERE id=$1 AND status='PENDING'`, [
        id,
        `Mary automatically sent approved Meta template ${template.name}.`,
        chatLabel,
        `SENT · ${template.name} · ${result.messageId}`,
        nextAt?.toISOString() || null
      ]);

      if (nextAt) {
        await sql.query(`INSERT INTO human_follow_up_tasks(id,phone,lead_id,scheduled_at,status,reason,source,sequence_step) VALUES($1,$2,$3,$4,'PENDING',$5,'MARY',$6) ON CONFLICT (phone) WHERE status='PENDING' DO NOTHING`, [crypto.randomUUID(), phone, lead.id, nextAt.toISOString(), `Mary automatic follow-up sequence · step ${step + 1}`, step + 1]);
        await updateLead(phone, { followUpAt: nextAt.toISOString(), status: "FOLLOW-UP REQUIRED" }).catch(() => undefined);
      } else {
        await updateLead(phone, { followUpAt: null, status: "FOLLOW-UP REQUIRED" }).catch(() => undefined);
      }
      sent += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Unknown Meta template error";
      await sql.query(`UPDATE human_follow_up_tasks SET transport_status=$2,updated_at=NOW() WHERE id=$1`, [id, `FAILED · ${message.slice(0, 300)}`]);
      console.error("Mary automatic follow-up failed", { taskId: id, phoneSuffix: phone.slice(-4), error });
    }
  }

  return { checked: rows.length, sent, failed, templatesAvailable: inventory.templates.length };
}
