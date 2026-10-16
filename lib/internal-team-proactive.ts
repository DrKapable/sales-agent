import { createHash } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { listTeamMembers, type TeamMember } from "@/lib/internal-team-registry";
import { teamAttention, teamFinance, teamMarketing, teamOverview } from "@/lib/internal-team-data";
import { sendStaffAlert } from "@/lib/team-alert-transport";

type Db=NeonQueryFunction<false,false>;
let client: Db | null=null;
function db() {
  if (!process.env.DATABASE_URL) throw new Error("Staff notifications require persistent database storage.");
  client ??= neon(process.env.DATABASE_URL);
  return client;
}

function localDay(now:Date) {
  return new Date(now.getTime()+2*60*60*1000).toISOString().slice(0,10);
}
function formatZmw(amount:unknown) {
  return `K${Number(amount||0).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
export function formatStaffSummary(member:TeamMember, overview:Record<string,unknown>, extra:string[]) {
  return [
    `MedMinds staff brief — ${member.name}`,
    `Zambia date: ${localDay(new Date())}`,
    `Client scope: ${String(overview.scope||"authorised data")}`,
    `New enquiries yesterday: ${Number(overview.newLeadsInPeriod||0)}`,
    `Current leads: ${Number(overview.totalLeads||0)}; converted: ${Number(overview.converted||0)}`,
    `Hot open: ${Number(overview.hotOpenLeads||0)}; follow-ups due: ${Number(overview.followUpsDue||0)}`,
    ...extra
  ].join("\n").slice(0,1800);
}
async function ensureDeliveries() {
  await db().query(`CREATE TABLE IF NOT EXISTS team_proactive_deliveries (
    id UUID PRIMARY KEY, staff_id UUID NOT NULL REFERENCES team_staff(id),
    event_key TEXT NOT NULL, kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ, message_id TEXT, error_note TEXT,
    UNIQUE (staff_id,event_key)
  )`);
}
async function sendOnce(member:TeamMember,key:string,kind:string,heading:string,body:string) {
  const delivery=await db().query(`INSERT INTO team_proactive_deliveries(id,staff_id,event_key,kind)
    VALUES ($1,$2,$3,$4) ON CONFLICT (staff_id,event_key) DO NOTHING RETURNING id`,
    [crypto.randomUUID(),member.id,key,kind]);
  if (!delivery.length) return {status:"already_claimed",member:member.name};
  try {
    const result=await sendStaffAlert({phone:member.phone,name:member.name,heading,body});
    await db().query(`UPDATE team_proactive_deliveries SET status='ACCEPTED',delivered_at=NOW(),message_id=$2
      WHERE id=$1`,[delivery[0].id,result.messageId||null]);
    return {status:"submitted",member:member.name};
  } catch(error) {
    const reason=error instanceof Error?error.message:"Unknown WhatsApp delivery failure";
    await db().query(`UPDATE team_proactive_deliveries SET status='FAILED',error_note=$2 WHERE id=$1`,
      [delivery[0].id,reason.slice(0,300)]).catch(()=>undefined);
    // Do not automatically retry a possibly accepted WhatsApp message.
    return {status:"failed",member:member.name,reason:"WhatsApp submission could not be verified."};
  }
}
async function overdueTasks(member:TeamMember) {
  const rows=await db().query(`SELECT id,title,priority,due_at FROM business_tasks
    WHERE status<>'COMPLETED' AND ($1='director' OR assigned_to=$2)
      AND (due_at<NOW() OR priority IN ('urgent','high'))
    ORDER BY due_at ASC NULLS LAST LIMIT 12`,[member.role,member.name]);
  return rows.map(r=>({id:String(r.id),title:String(r.title).slice(0,80),
    priority:String(r.priority),dueAt:r.due_at?String(r.due_at):null}));
}
async function summaryFor(member:TeamMember) {
  const overview=await teamOverview(member,"yesterday");
  const details:string[]=[];
  if (member.role==="director") {
    const finance=await teamFinance(member,"yesterday");
    details.push(`Verified yesterday: ${formatZmw(finance.summary.verifiedAmountZmw)} (${finance.summary.verifiedPayments} entries)`);
    details.push(`Pending recorded yesterday: ${finance.summary.pendingPayments} (${formatZmw(finance.summary.pendingAmountZmw)})`);
  } else if (member.role==="marketing") {
    const marketing=await teamMarketing(member,"last7");
    details.push(`Top enquiries (last 7 days): ${(marketing.categories||[]).slice(0,3).map(r=>`${r.service} ${r.enquiries}`).join("; ")||"None"}`);
  } else {
    const attention=await teamAttention(member);
    const count=Array.isArray((attention as any).openTasks)?(attention as any).openTasks.length:0;
    details.push(`Open tasks in priority list: ${count}`);
  }
  details.push("Reply to Mary for details or to propose a staff action.");
  return formatStaffSummary(member,overview,details);
}
async function attentionFor(member:TeamMember) {
  if (member.role==="marketing") {
    const tasks=await overdueTasks(member);
    return {fingerprint:JSON.stringify(tasks),body:tasks.length?
      `Marketing tasks needing attention: ${tasks.slice(0,5).map(t=>t.title).join("; ")}`:""};
  }
  const attention=await teamAttention(member);
  const clients=((attention as any).leads?.clients||[]).slice(0,8) as Array<{name?:string;phone?:string;status?:string;priority?:string}>;
  const tasks=await overdueTasks(member);
  const fingerprint=JSON.stringify({clients:clients.map(c=>[c.phone,c.status,c.priority]),tasks:tasks.map(t=>t.id)});
  const body=(!clients.length&&!tasks.length)?"":[
    `MedMinds priorities for ${member.name} (Zambia time)`,
    clients.length?`Clients needing attention: ${clients.slice(0,5).map(c=>c.name||c.phone||"Unnamed").join(", ")}`:null,
    tasks.length?`High-priority/overdue tasks: ${tasks.slice(0,5).map(t=>t.title).join("; ")}`:null,
    "Reply 'what needs attention?' for details and next steps."
  ].filter(Boolean).join("\n");
  return {fingerprint,body};
}

/** Scheduled by Vercel Cron, with deduplication and per-staff opt-outs. */
export async function runTeamNotifications(kind:"daily"|"attention",now=new Date()) {
  await ensureDeliveries();
  const members=(await listTeamMembers()).filter(m=>m.active &&
    (kind==="daily"?m.dailyBriefEnabled:m.priorityAlertsEnabled));
  const date=localDay(now);
  const results:Array<{status:string;member:string;reason?:string}>=[];
  for(const member of members) {
    try {
      if(kind==="daily") {
        const body=await summaryFor(member);
        results.push(await sendOnce(member,`daily:${date}`,"daily","MedMinds staff daily brief",body));
      } else {
        const {fingerprint,body}=await attentionFor(member);
        if(!body){results.push({status:"nothing_urgent",member:member.name});continue;}
        const hash=createHash("sha256").update(fingerprint).digest("hex").slice(0,24);
        results.push(await sendOnce(member,`attention:${date}:${hash}`,"attention","MedMinds priority alert",body));
      }
    } catch(error) {
      console.error("Team proactive intelligence failed for staff",{
        memberId:member.id,kind,error:error instanceof Error?error.name:"unknown"
      });
      results.push({status:"failed",member:member.name,reason:"Unable to prepare staff notification."});
    }
  }
  return {kind,date,total:results.length,submitted:results.filter(r=>r.status==="submitted").length,results};
}
