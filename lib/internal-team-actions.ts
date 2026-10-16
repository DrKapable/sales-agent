import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { canonicalTeamPhone, findTeamMember, listTeamMembers, type TeamMember } from "@/lib/internal-team-registry";
import { createMirroredBusinessTask } from "@/lib/business-task-bridge";
import { addMessage, getConversation, getLeadById } from "@/lib/store";
import { sendStaffAlert } from "@/lib/team-alert-transport";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendWhatsAppFollowUpTemplate } from "@/lib/whatsapp-template";
import { recordOutgoingMessageAccepted } from "@/lib/message-delivery";
import { leadStatuses } from "@/lib/types";

export type ActionKind = "assign_lead" | "update_lead" | "create_task" | "complete_task" | "progress_task" | "message_staff" | "follow_up_client";
export type TeamAction = {
  kind: ActionKind;
  client?: string; assignee?: string; status?: string; priority?: string;
  task?: string; title?: string; notes?: string; message?: string; dueAt?: string;
};
type Db = NeonQueryFunction<false, false>;
let connection: Db | null = null;
function db() {
  if (!process.env.DATABASE_URL) throw new Error("Persistent storage is required for staff actions.");
  connection ??= neon(process.env.DATABASE_URL);
  return connection;
}
export function mayPerform(role: TeamMember["role"], kind: ActionKind) {
  if (kind === "assign_lead") return role === "director";
  if (kind === "update_lead" || kind === "follow_up_client") return role === "director" || role === "sales" || role === "support";
  if (kind === "create_task" || kind === "complete_task" || kind === "progress_task" || kind === "message_staff") return true;
  return false;
}
function canAccessLead(member: TeamMember, lead: Record<string, any>) {
  return member.role === "director" || (
    (member.role === "sales" || member.role === "support") && lead.assigned_to === member.name
  );
}
function requiresText(value: unknown, name: string, limit = 240) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s || s.length > limit) throw new Error("Please provide a valid " + name + ".");
  return s;
}
function validDueAt(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) throw new Error("Provide an ISO date and time including the offset.");
  return d.toISOString();
}
async function ensureActionTables() {
  const d=db();
  await d.query(`CREATE TABLE IF NOT EXISTS team_action_requests (
    id UUID PRIMARY KEY, code TEXT NOT NULL UNIQUE,
    staff_id UUID NOT NULL REFERENCES team_staff(id),
    action JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
    summary TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL, finished_at TIMESTAMPTZ, result TEXT
  )`);
  await d.query(`CREATE INDEX IF NOT EXISTS team_action_request_staff_idx ON team_action_requests(staff_id,created_at DESC)`);
  await d.query(`CREATE TABLE IF NOT EXISTS team_action_audit (
    id UUID PRIMARY KEY, action_id UUID NOT NULL,
    staff_id UUID NOT NULL, action_type TEXT NOT NULL,
    outcome TEXT NOT NULL, details TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}
async function exactLead(client: string) {
  const q=requiresText(client,"client name or number",130);
  const digits=q.replace(/\D/g,"");
  const results=await db().query(`SELECT id,name,phone,status,assigned_to,priority FROM leads
    WHERE LOWER(COALESCE(name,''))=LOWER($1)
      OR phone=$1 OR ($2 <> '' AND REGEXP_REPLACE(phone,'[^0-9]','','g')=$2)
    LIMIT 3`,[q,digits.length >= 9 ? digits : ""]);
  if (results.length !== 1) throw new Error(results.length ? "Several clients match. Specify a complete WhatsApp number." : "No client matched. Search the CRM and use the exact client name or number.");
  return results[0] as Record<string,any>;
}
function staffNameTokens(value: string) {
  return value.toLowerCase()
    .replace(/[’'\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !["dr","doctor","mr","mrs","ms","prof","professor"].includes(token));
}

/**
 * A short colleague name is accepted only when it uniquely identifies ONE
 * active person from the persisted registry. Never use partial phone digits.
 * Unlike the authenticated WhatsApp *sender*, this is a recipient lookup.
 */
export function matchingRegisteredStaff(members: readonly TeamMember[], input: string) {
  const query = input.trim();
  const phone = canonicalTeamPhone(query);
  if (/^[+()\d\s-]+$/.test(query)) {
    return phone.length >= 9 ? members.filter((m) => m.active && m.phone === phone) : [];
  }
  const tokens = staffNameTokens(query);
  if (!tokens.length || tokens.some((token) => token.length < 3)) return [];
  return members.filter((member) => {
    if (!member.active) return false;
    const registered = staffNameTokens(member.name);
    return tokens.every((token) => registered.includes(token));
  });
}

export async function resolveRegisteredStaff(input: string) {
  const q=requiresText(input,"registered staff member",140);
  const members=matchingRegisteredStaff(await listTeamMembers(),q);
  if (members.length > 1) throw new Error("More than one active colleague matches that name. Please specify the full name.");
  if (!members.length) throw new Error("No active registered colleague matches that name. Please check the Team WhatsApp access directory.");
  return members[0];
}

async function staffFor(input: string) {
  return resolveRegisteredStaff(input);
}

/** The preview is the exact free-form message body; the provider may use an approved
 * notification template if the recipient's 24-hour WhatsApp window has closed. */
export function staffMessagePreview(sender: string, recipient: string, message: string) {
  return [
    "*Recipient:* " + recipient,
    "*Message heading:* Message from " + sender + " via Mary Kaunda",
    "*Message body:*",
    message
  ].join("\n");
}
async function exactTask(input:string, member:TeamMember) {
  const q=requiresText(input,"task ID or exact title",240);
  const matches=await db().query(`SELECT id,title,assigned_to,status FROM business_tasks
    WHERE id::text=$1 OR LOWER(title)=LOWER($1) ORDER BY created_at DESC LIMIT 3`,[q]);
  if (matches.length!==1) throw new Error(matches.length ? "Multiple tasks match. Use the task UUID." : "Task not found.");
  const task=matches[0] as Record<string,any>;
  if (member.role!=="director" && task.assigned_to!==member.name) throw new Error("Only the director or assigned staff member can complete this task.");
  return task;
}
export async function validateTeamAction(member:TeamMember, action:TeamAction) {
  if (!mayPerform(member.role,action.kind)) throw new Error("Your role does not permit that action.");
  switch(action.kind) {
    case "assign_lead": {
      const lead=await exactLead(action.client||"");
      const person=await staffFor(action.assignee||"");
      return {summary:`Assign ${lead.name||lead.phone} to ${person.name}`};
    }
    case "update_lead": {
      const lead=await exactLead(action.client||"");
      if (!canAccessLead(member,lead)) throw new Error("You are not authorised for this client.");
      const status=action.status?.trim().toUpperCase();
      if (status && (!leadStatuses.includes(status as typeof leadStatuses[number]) || status==="CONVERTED")) {
        throw new Error("Converted status requires verified payment through the admin dashboard.");
      }
      const priority=action.priority?.trim().toUpperCase();
      if (priority && !["HOT","WARM","STANDARD"].includes(priority)) throw new Error("Invalid lead priority.");
      if (!status && !priority) throw new Error("Specify a valid status or priority.");
      return {summary:`Update ${lead.name||lead.phone}: ${status||""} ${priority||""}`.trim()};
    }
    case "create_task": {
      const title=requiresText(action.title,"task title",240);
      const assignee=action.assignee ? await staffFor(action.assignee) : member;
      if (member.role!=="director" && assignee.id!==member.id) throw new Error("Staff may create tasks for themselves; only the director can assign another person.");
      validDueAt(action.dueAt);
      if (action.client) { const lead=await exactLead(action.client); if (!canAccessLead(member,lead)) throw new Error("Not authorised for this client."); }
      return {summary:`Create task "${title}" for ${assignee.name}`};
    }
    case "complete_task": {
      const task=await exactTask(action.task||"",member);
      if (task.status==="COMPLETED") throw new Error("This task is already completed.");
      return {summary:`Mark "${task.title}" completed`};
    }
    case "progress_task": {
      const task=await exactTask(action.task||"",member);
      if (task.status==="COMPLETED") throw new Error("This task has already been completed.");
      const note=requiresText(action.notes,"task progress note",1000);
      return {summary:`Add progress to "${task.title}": ${note.slice(0,130)}`};
    }
    case "message_staff": {
      const target=await staffFor(action.assignee||"");
      if (target.id===member.id) throw new Error("Choose another team member.");
      const message=requiresText(action.message,"message",900);
      return {summary:`Send to ${target.name}: "${message.slice(0,160)}"`};
    }
    case "follow_up_client": {
      const lead=await exactLead(action.client||"");
      if (!canAccessLead(member,lead)) throw new Error("Not authorised for this client.");
      if (["CONVERTED","LOST LEAD"].includes(String(lead.status))) throw new Error("This client is marked converted/lost; no unsolicited follow-up will be sent.");
      if (action.message) requiresText(action.message,"follow-up message",900);
      return {summary:`Send follow-up to ${lead.name||lead.phone}`};
    }
  }
}
export async function stageTeamAction(member:TeamMember, action:TeamAction) {
  await ensureActionTables();
  const validated=await validateTeamAction(member,action);
  const id=crypto.randomUUID();
  const code=id.slice(0,8).toUpperCase();
  await db().query(`INSERT INTO team_action_requests (id,code,staff_id,action,summary,expires_at)
    VALUES ($1,$2,$3,$4::jsonb,$5,NOW()+INTERVAL '10 minutes')`,
    [id,code,member.id,JSON.stringify(action),validated.summary]);
  if (action.kind === "message_staff") {
    const recipient = await staffFor(action.assignee || "");
    const fullBody = requiresText(action.message,"message",900);
    return [
      "*WhatsApp message for your approval*",
      staffMessagePreview(member.name,recipient.name,fullBody),
      "Outside the 24-hour reply window, an approved Meta notification template may be used.",
      "To send, reply *CONFIRM " + code + "* within 10 minutes.",
      "To cancel, reply *CANCEL " + code + "*.",
      "*Nothing has been sent.*"
    ].join("\n\n");
  }
  return `Proposed: ${validated.summary}. To proceed, reply *CONFIRM ${code}* within 10 minutes. No action has been performed yet.`;
}
async function applyTeamAction(member:TeamMember, action:TeamAction):Promise<string> {
  // Re-resolve all client/staff/task scopes at execution time to prevent role or assignment drift.
  await validateTeamAction(member,action);
  switch(action.kind) {
    case "assign_lead": {
      const lead=await exactLead(action.client||"");
      const recipient=await staffFor(action.assignee||"");
      const rows=await db().query(`UPDATE leads SET assigned_to=$2,updated_at=NOW() WHERE id=$1 RETURNING id`,[lead.id,recipient.name]);
      if (!rows.length) throw new Error("Client assignment failed.");
      let notification="Staff notification sent.";
      try { await sendStaffAlert({phone:recipient.phone,name:recipient.name,heading:"New client assignment from Mary Kaunda",body:`${member.name} assigned client ${lead.name||lead.phone}. Open your MedMinds task list for details.`}); }
      catch { notification="Staff notification could not be confirmed."; }
      return `Assigned ${lead.name||lead.phone} to ${recipient.name}. ${notification}`;
    }
    case "update_lead": {
      const lead=await exactLead(action.client||"");
      const status=action.status?.trim().toUpperCase()||null;
      const priority=action.priority?.trim().toUpperCase()||null;
      const rows=await db().query(`UPDATE leads SET status=COALESCE($2,status),priority=COALESCE($3,priority),updated_at=NOW()
        WHERE id=$1 AND ($4='director' OR assigned_to=$5) RETURNING id`,[lead.id,status,priority,member.role,member.name]);
      if (!rows.length) throw new Error("Client assignment or permission changed.");
      return `Updated ${lead.name||lead.phone}.`;
    }
    case "create_task": {
      const recipient=action.assignee?await staffFor(action.assignee):member;
      const lead=action.client?await exactLead(action.client):null;
      const result=await createMirroredBusinessTask({
        title:requiresText(action.title,"task title"), assignedTo:recipient.name,
        leadId:lead?.id, dueAt:validDueAt(action.dueAt)||undefined,
        notes:action.notes?.slice(0,1200),priority:["urgent","high","standard","low"].includes(action.priority||"")?
          action.priority as "urgent"|"high"|"standard"|"low":"standard",
      },lead ? await getLeadById(String(lead.id)):null);
      let notification = " Team notification sent.";
      if (recipient.id !== member.id) {
        try {
          await sendStaffAlert({phone:recipient.phone,name:recipient.name,heading:"New assignment from Mary Kaunda",body:`${member.name} assigned a task: ${String(action.title||"")} (ID: ${String((result as Record<string, unknown>).id || "")}).`});
        } catch { notification = " Notification delivery could not be confirmed; check the staff dashboard."; }
      }
      return `Task created for ${recipient.name} (ID: ${String((result as Record<string, unknown>).id || "")}) and synchronised with the Research Portal.${notification}`;
    }
    case "complete_task": {
      const task=await exactTask(action.task||"",member);
      const result=await db().query(`UPDATE business_tasks SET status='COMPLETED',completed_at=NOW()
        WHERE id=$1 AND status <> 'COMPLETED' AND ($2='director' OR assigned_to=$3) RETURNING id`,[task.id,member.role,member.name]);
      if (!result.length) throw new Error("Task was already completed or reassigned.");
      return `Completed task: ${task.title}.`;
    }
    case "progress_task": {
      const task=await exactTask(action.task||"",member);
      const note=requiresText(action.notes,"task progress note",1000);
      const rows=await db().query(`UPDATE business_tasks
        SET notes=concat_ws(E'\\n',NULLIF(notes,''),$2)
        WHERE id=$1 AND status<>'COMPLETED' AND ($3='director' OR assigned_to=$4)
        RETURNING id`,[task.id,`[${new Date().toISOString()} by ${member.name}] ${note}`,member.role,member.name]);
      if(!rows.length)throw new Error("Task access or status changed.");
      return `Progress recorded for "${task.title}".`;
    }
    case "message_staff": {
      const target=await staffFor(action.assignee||"");
      await sendStaffAlert({phone:target.phone,name:target.name,heading:`Message from ${member.name} via Mary Kaunda`,body:requiresText(action.message,"message",900)});
      return `Message submitted to WhatsApp for ${target.name}. Delivery confirmation may follow.`;
    }
    case "follow_up_client": {
      const lead=await exactLead(action.client||"");
      const history=await getConversation(String(lead.phone),70);
      const lastInbound=[...history].reverse().find(m=>m.role==="user");
      const inWindow=lastInbound && Date.now()-new Date(lastInbound.createdAt).getTime()<24*3600_000;
      let id:string;
      let note:string;
      if (inWindow) {
        const message=action.message?.trim() || `Hello ${String(lead.name||"there").split(/\s+/)[0]}, following up on your MedMinds enquiry. Please let us know if you need assistance with the next step.`;
        const sent=await sendWhatsAppText(String(lead.phone),message);
        id=sent.messageId; note=message;
      } else {
        const sent=await sendWhatsAppFollowUpTemplate(String(lead.phone));
        id=sent.messageId; note="[Approved WhatsApp follow-up template sent; outside customer-service window]";
      }
      await addMessage(String(lead.phone),"assistant",`[Human: ${member.name}] ${note}`,id).catch(()=>undefined);
      await recordOutgoingMessageAccepted({messageId:id,phone:String(lead.phone)}).catch(()=>undefined);
      return `Follow-up submitted for ${lead.name||lead.phone} (${inWindow?"personalised message":"approved template"}).`;
    }
  }
}
export async function confirmTeamAction(member:TeamMember,code:string) {
  if (!/^[0-9A-F]{8}$/.test(code)) return "Use the eight-character confirmation code.";
  await ensureActionTables();
  const current=await findTeamMember(member.phone);
  if (!current||current.id!==member.id) return "Your team access has changed. This request cannot be completed.";
  const claimed=await db().query(`UPDATE team_action_requests SET status='PROCESSING'
    WHERE staff_id=$1 AND code=$2 AND status='PENDING' AND expires_at>NOW()
    RETURNING id,action,summary`,[member.id,code]);
  if (!claimed.length) return "This confirmation is missing, expired, or has already been processed.";
  const request=claimed[0];
  const action=request.action as TeamAction;
  let status="COMPLETED"; let result="";
  try {
    result=await applyTeamAction(current,action);
  } catch (error) {
    status="FAILED";
    result=error instanceof Error?error.message:"The action could not be completed.";
  }
  await db().query(`UPDATE team_action_requests SET status=$2,result=$3,finished_at=NOW() WHERE id=$1`,[request.id,status,result]);
  await db().query(`INSERT INTO team_action_audit (id,action_id,staff_id,action_type,outcome,details)
    VALUES ($1,$2,$3,$4,$5,$6)`,[crypto.randomUUID(),request.id,member.id,action.kind,status,result]).catch(()=>undefined);
  return status==="COMPLETED"?result:`Action failed: ${result}. No automatic retry will occur; check records before requesting it again.`;
}
export async function cancelTeamAction(member:TeamMember,code:string) {
  await ensureActionTables();
  const rows=await db().query(`UPDATE team_action_requests SET status='CANCELLED',finished_at=NOW()
    WHERE staff_id=$1 AND code=$2 AND status='PENDING' RETURNING id`,[member.id,code]);
  return rows.length?"The proposed action was cancelled.":"No pending action found for that code.";
}
