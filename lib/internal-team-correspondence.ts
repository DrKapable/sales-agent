import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { listTeamMembers, type TeamMember } from "@/lib/internal-team-registry";

import { sendStaffAlert } from "@/lib/team-alert-transport";

type Database = NeonQueryFunction<false, false>;
let client: Database | null = null;
let setup: Promise<void> | null = null;
function db(): Database {
  if (!process.env.DATABASE_URL) throw new Error("The live staff database is unavailable.");
  client ??= neon(process.env.DATABASE_URL);
  return client;
}
async function ensureTables() {
  setup ??= (async () => {
    await db().query(`CREATE TABLE IF NOT EXISTS team_staff_dispatches (
      id UUID PRIMARY KEY,
      action_id UUID NOT NULL UNIQUE,
      sender_staff_id UUID NOT NULL REFERENCES team_staff(id),
      recipient_staff_id UUID NOT NULL REFERENCES team_staff(id),
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PREPARING',
      message_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      error_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db().query(`CREATE INDEX IF NOT EXISTS team_staff_dispatches_sender_idx
      ON team_staff_dispatches(sender_staff_id,created_at DESC)`);
    await db().query(`CREATE INDEX IF NOT EXISTS team_staff_dispatches_recipient_idx
      ON team_staff_dispatches(recipient_staff_id,created_at DESC)`);
    await db().query(`CREATE TABLE IF NOT EXISTS team_staff_dispatch_replies (
      id UUID PRIMARY KEY,
      dispatch_id UUID NOT NULL REFERENCES team_staff_dispatches(id),
      staff_id UUID NOT NULL REFERENCES team_staff(id),
      incoming_message_id TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      relationship TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      forwarded_at TIMESTAMPTZ,
      forward_state TEXT NOT NULL DEFAULT 'NOT_ATTEMPTED'
    )`);
  })().catch(error => { setup = null; throw error; });
  await setup;
}
export async function beginStaffDispatch(input: {
  actionId: string; sender: TeamMember; recipient: TeamMember; body: string;
}) {
  await ensureTables();
  const id = crypto.randomUUID();
  const rows = await db().query(`INSERT INTO team_staff_dispatches
    (id,action_id,sender_staff_id,recipient_staff_id,body)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (action_id) DO NOTHING RETURNING id`,
    [id,input.actionId,input.sender.id,input.recipient.id,input.body]);
  if (!rows.length) throw new Error("This staff message was already submitted for processing.");
  return id;
}
export async function finishStaffDispatch(id: string, messageIds: string[]) {
  await ensureTables();
  const unique = [...new Set(messageIds.filter(Boolean))];
  if (!unique.length) throw new Error("WhatsApp returned no message identifiers.");
  await db().query(`UPDATE team_staff_dispatches SET message_ids=$2::jsonb,status='ACCEPTED',
    updated_at=NOW() WHERE id=$1 AND status='PREPARING'`,[id,JSON.stringify(unique)]);
}
export async function flagStaffDispatchUncertain(id: string, reason: string) {
  await ensureTables();
  await db().query(`UPDATE team_staff_dispatches SET status='UNCERTAIN',
    error_note=$2,updated_at=NOW() WHERE id=$1 AND status='PREPARING'`,
    [id,reason.slice(0,300)]);
}
/** Distinguish status enquiries from instructions that would send or change records. */
export function isStaffCorrespondenceInquiry(text:string) {
  const q=text.trim();
  if (/^(send|message|remind|assign|follow up with|forward|tell|create|mark|update the|delete|confirm [a-f0-9]{8})\b/i.test(q)) return false;
  return /\b(delivery|delivered|read receipt|confirm delivery|who replied|what (?:did|has|have|was) .{0,70}(?:say|said|replied|responded)|what .{0,70} (?:say|said)|has .{0,70} replied|did .{0,70} (?:read|reply|respond)|has .{0,70} (?:responded|replied)|who (?:has )?responded|(?:any|latest|their|his|her) replies|what (?:has )?.{0,40}replied|(?:staff|team) (?:message|reply|replies|response|updates)|heard (?:back )?from|any (?:reply|response) from|check (?:their|his|her|the) (?:reply|message)|what he replies|what she replies)\b/i.test(q);
}
function formatWhen(value: unknown) {
  if (!value) return "unknown";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone:"Africa/Lusaka",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"
  }).format(date) + " Zambia time";
}
export function deliveryLabel(statuses: string[], overall: string) {
  if (overall !== "ACCEPTED") return overall === "UNCERTAIN" ? "Submission unverified" : "Submission not confirmed";
  if (!statuses.length) return "Accepted by WhatsApp; delivery not yet confirmed";
  if (statuses.includes("FAILED")) return "Failed for at least one message";
  if (statuses.every(s => s === "READ")) return "Read";
  if (statuses.every(s => s === "DELIVERED")) return "Delivered";
  if (statuses.every(s => s === "READ" || s === "DELIVERED")) return "Delivered (some parts read)";
  if (statuses.every(s => s === "SENT")) return "Sent";
  if (statuses.every(s => ["READ","DELIVERED","SENT"].includes(s))) return "Sent (some parts delivered/read)";
  return "Accepted by WhatsApp; awaiting further delivery receipts";
}
function compactText(input: unknown, limit = 450) {
  return String(input || "").replace(/\s+/g," ").slice(0,limit);
}
function matchingRegisteredStaff(members: readonly TeamMember[], input: string) {
  const normalize = (value:string) => value.toLowerCase()
    .replace(/['’]s\b/g,"").replace(/[^a-z0-9]+/g," ").trim()
    .split(/\s+/).filter(token => token.length >= 3 && !["dr","mr","mrs","ms","doctor"].includes(token));
  const tokens=normalize(input);
  if(!tokens.length)return [];
  return members.filter(member=>member.active &&
    tokens.every(token=>normalize(member.name).includes(token)));
}
function matchNames(members: TeamMember[], text: string) {
  const words = text.toLowerCase().replace(/[^a-z0-9'’]+/g," ").split(/\s+/);
  const found = new Map<string,TeamMember>();
  for (const word of words) {
    if (word.length < 4) continue;
    const matches = matchingRegisteredStaff(members,word);
    if (matches.length === 1) found.set(matches[0].id,matches[0]);
  }
  return [...found.values()];
}
/**
 * Provides verified delivery receipts and actual staff messages; never invents a
 * conversational reply from a CRM status, or calls API acceptance 'delivered'.
 */
export async function staffCorrespondenceReport(requester: TeamMember, question: string) {
  await ensureTables();
  const all = (await listTeamMembers()).filter(m=>m.active);
  const mentioned = matchNames(all,question).filter(m=>m.id!==requester.id);
  const own = await db().query(`SELECT d.id,d.body,d.status,d.message_ids,d.created_at,
      d.recipient_staff_id,d.sender_staff_id,s.name AS recipient_name
    FROM team_staff_dispatches d JOIN team_staff s ON s.id=d.recipient_staff_id
    WHERE (d.sender_staff_id=$1 OR (d.recipient_staff_id=$1 AND $2='director'))
    ORDER BY d.created_at DESC LIMIT 15`,[requester.id,requester.role]);
  const older = await db().query(`SELECT action,created_at,summary FROM team_action_requests
    WHERE staff_id=$1 AND action->>'kind'='message_staff' AND status='COMPLETED'
    ORDER BY created_at DESC LIMIT 6`,[requester.id]);
  const hasLast = own.length > 0 || older.length > 0;
  const asksPronoun = /\b(he|him|his|she|her|they|their|latest|last|delivery|delivered)\b/i.test(question);
  const recentRecipientId = own[0]?.recipient_staff_id ? String(own[0].recipient_staff_id) : null;
  if (asksPronoun && recentRecipientId) {
    const candidate = all.find(m=>m.id===recentRecipientId);
    if (candidate && candidate.id!==requester.id && !mentioned.some(m=>m.id===candidate.id)) mentioned.unshift(candidate);
  } else if (asksPronoun && older[0]?.action) {
    const data=older[0].action as {assignee?:string;recipientId?:string};
    const candidate=all.find(m=>m.id===data.recipientId)
      || (data.assignee ? matchingRegisteredStaff(all,data.assignee)[0] : undefined);
    if (candidate && candidate.id!==requester.id && !mentioned.some(m=>m.id===candidate.id)) mentioned.unshift(candidate);
  }
  if (!mentioned.length && hasLast && asksPronoun) {
    // A legacy sent instruction may have no tracked message IDs. Never infer a
    // provider receipt from the staff phone and approximate send timestamp.
    const legacy=older[0];
    return legacy
      ? "The earlier staff instruction was recorded as completed, but its WhatsApp message ID was not retained for recipient-specific verification. I cannot establish its delivered/read status. Ask me about the colleague by name for their actual latest staff message."
      : "No named colleague was resolved from the request. Please specify which team member.";
  }
  if (!mentioned.length) return "Please specify the colleague whose delivery and replies you want me to check.";

  const output: string[] = [];
  for(const colleague of mentioned.slice(0,5)) {
    const allowed=requester.role==="director"||requester.id===colleague.id
      || own.some(row => String(row.recipient_staff_id)===colleague.id && String(row.sender_staff_id)===requester.id);
    if (!allowed) {
      output.push(colleague.name + ": you are not authorised to view this colleague's staff conversation.");
      continue;
    }
    const dispatches=own.filter(row => String(row.recipient_staff_id)===colleague.id
      && String(row.sender_staff_id)===requester.id).slice(0,2);
    const block:string[]=[colleague.name + ":"];
    if (dispatches.length) {
      for(const entry of dispatches) {
        const ids=Array.isArray(entry.message_ids)?entry.message_ids.map(String):[];
        const statuses=ids.length ? await db().query(`SELECT message_id,status,updated_at,error
          FROM message_delivery_status WHERE message_id=ANY($1::text[])`,[ids]) : [];
        const perId=new Map(statuses.map(s=>[String(s.message_id),String(s.status).toUpperCase()]));
        const label=deliveryLabel(ids.map(id=>perId.get(id)||"ACCEPTED"),String(entry.status));
        const latestReceipt=statuses.reduce((date:string|null,s)=>!date||String(s.updated_at)>date?String(s.updated_at):date,null);
        block.push("Sent instruction ("+formatWhen(entry.created_at)+"): "
          +compactText(entry.body,190));
        block.push("WhatsApp: "+label+(latestReceipt?" (receipt "+formatWhen(latestReceipt)+")":""));
        const failed=statuses.find(s=>String(s.status)==="FAILED");
        if(failed?.error)block.push("Provider failure: "+compactText(failed.error,160));
        const replies=await db().query(`SELECT content,received_at,relationship FROM team_staff_dispatch_replies
          WHERE dispatch_id=$1 ORDER BY received_at DESC LIMIT 3`,[entry.id]);
        for(const reply of replies) {
          block.push((reply.relationship==="whatsapp_context"?"Direct WhatsApp reply":"Staff message received after the instruction; context not confirmed")
            +" ("+formatWhen(reply.received_at)+"): "+compactText(reply.content,400));
        }
      }
    } else {
      const legacy=older.find(row=>{
        const a=row.action as {assignee?:string;recipientId?:string};
        return a.recipientId===colleague.id
          || (a.assignee && matchingRegisteredStaff(all,a.assignee).some(m=>m.id===colleague.id));
      });
      block.push(legacy
        ? "An earlier instruction is recorded ("+formatWhen(legacy.created_at)+"), but delivery/read status is not linked to its WhatsApp message ID."
        : "No tracked staff instruction from you was found.");
    }
    const latest=await db().query(`SELECT content,created_at FROM team_chat_messages
      WHERE staff_id=$1 AND role='user' ORDER BY created_at DESC LIMIT 2`,[colleague.id]);
    if (latest.length) {
      block.push("Latest message(s) received from "+colleague.name+" (not necessarily replies to this instruction):");
      for(const msg of latest)block.push(formatWhen(msg.created_at)+": "+compactText(msg.content,450));
    } else block.push("No incoming staff message recorded from this colleague.");
    output.push(block.join("\n"));
  }
  return output.join("\n\n").slice(0,3850);
}
/** Forward a colleague's clearly associated reply to the person who sent the instruction. */
export async function relayTeamStaffReply(input: {
  member:TeamMember;incomingMessageId:string;text:string;replyToMessageId?:string|null;
}) {
  await ensureTables();
  const candidates=await db().query(`SELECT d.id,d.sender_staff_id,d.recipient_staff_id,
      d.message_ids,d.created_at,d.status,s.name AS sender_name,s.phone_digits AS sender_phone
    FROM team_staff_dispatches d JOIN team_staff s ON s.id=d.sender_staff_id
    WHERE d.recipient_staff_id=$1 AND d.status='ACCEPTED'
      AND d.created_at >= NOW()-INTERVAL '48 hours'
    ORDER BY d.created_at DESC LIMIT 6`,[input.member.id]);
  let match:Record<string,any>|undefined;
  let relationship="whatsapp_context";
  if (input.replyToMessageId) {
    match=candidates.find(d=>Array.isArray(d.message_ids)&&d.message_ids.includes(input.replyToMessageId));
  } else if(candidates.length===1 && /\b(done|completed|resolved|addressed|noted|received|acknowledged|working on|in progress|will|i'?ll|updated|replied|contacted|followed up|please tell|please update|report|issue|client)\b/i.test(input.text)) {
    match=candidates[0]; relationship="recent_unique";
  }
  if(!match) return {linked:false,forwarded:false};
  const stored=await db().query(`INSERT INTO team_staff_dispatch_replies
    (id,dispatch_id,staff_id,incoming_message_id,content,relationship)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (incoming_message_id) DO NOTHING RETURNING id`,
    [crypto.randomUUID(),match.id,input.member.id,input.incomingMessageId,input.text,relationship]);
  if(!stored.length)return {linked:true,forwarded:false};
  const sender = (await listTeamMembers()).find(m=>m.id===match.sender_staff_id&&m.active);
  if(!sender) return {linked:true,forwarded:false};
  try {
    await sendStaffAlert({
      phone:sender.phone,name:sender.name,
      heading:"Staff update from "+input.member.name+" via Mary Kaunda",
      body:(relationship==="whatsapp_context"?"Reply to your earlier instruction":"New staff message following your instruction (not explicitly threaded)")
        +"\nReceived: "+formatWhen(new Date())+"\n"+compactText(input.text,950)
    });
    await db().query(`UPDATE team_staff_dispatch_replies SET forwarded_at=NOW(),
      forward_state='ACCEPTED' WHERE id=$1`,[stored[0].id]);
    return {linked:true,forwarded:true};
  } catch(error) {
    await db().query(`UPDATE team_staff_dispatch_replies SET forward_state='FAILED'
      WHERE id=$1`,[stored[0].id]).catch(()=>undefined);
    console.warn("Staff reply forwarding unavailable",{recipientStaffId:input.member.id,
      reason:error instanceof Error?error.name:"unknown"});
    return {linked:true,forwarded:false};
  }
}
