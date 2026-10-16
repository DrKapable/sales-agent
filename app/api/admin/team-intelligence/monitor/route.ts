import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { sessionCookieName, verifySessionToken } from "@/lib/session";
import { listTeamMembers } from "@/lib/internal-team-registry";

export const dynamic="force-dynamic";

export async function GET(request:NextRequest) {
  if(!verifySessionToken(request.cookies.get(sessionCookieName)?.value))
    return NextResponse.json({error:"Unauthorized"},{status:401});
  if(!process.env.DATABASE_URL)return NextResponse.json({error:"Persistent database unavailable."},{status:503});
  try {
    const db=neon(process.env.DATABASE_URL);
    const members=await listTeamMembers();
    const tables=await db.query(`SELECT
      to_regclass('public.team_action_requests') AS actions,
      to_regclass('public.team_action_audit') AS audit,
      to_regclass('public.team_proactive_deliveries') AS delivery`);
    const actionTable=Boolean(tables[0]?.actions);
    const deliveryTable=Boolean(tables[0]?.delivery);
    const [actions,notifications]=await Promise.all([
      actionTable ? db.query(`SELECT
        COUNT(*) FILTER (WHERE status='PENDING' AND expires_at>NOW())::int AS pending,
        COUNT(*) FILTER (WHERE status='FAILED' AND created_at>NOW()-INTERVAL '7 days')::int AS failed_last7,
        COUNT(*) FILTER (WHERE status='COMPLETED' AND created_at>NOW()-INTERVAL '7 days')::int AS completed_last7
        FROM team_action_requests`) : Promise.resolve([{pending:0,failed_last7:0,completed_last7:0}]),
      deliveryTable ? db.query(`SELECT
        COUNT(*) FILTER (WHERE status='ACCEPTED' AND created_at>NOW()-INTERVAL '7 days')::int AS accepted_last7,
        COUNT(*) FILTER (WHERE status='FAILED' AND created_at>NOW()-INTERVAL '7 days')::int AS failed_last7,
        COUNT(*) FILTER (WHERE status='PROCESSING' AND created_at<NOW()-INTERVAL '15 minutes')::int AS stuck
        FROM team_proactive_deliveries`) : Promise.resolve([{accepted_last7:0,failed_last7:0,stuck:0}])
    ]);
    return NextResponse.json({
      generatedAt:new Date().toISOString(),
      staff:{configured:members.length,active:members.filter(m=>m.active).length,
        briefsEnabled:members.filter(m=>m.active&&m.dailyBriefEnabled).length,
        alertsEnabled:members.filter(m=>m.active&&m.priorityAlertsEnabled).length},
      actions:actions[0],notifications:notifications[0],
      note:"Accepted means WhatsApp accepted the submission, not proof the recipient read it."
    });
  }catch(error){
    console.error("Staff communication monitoring query failed",{error});
    return NextResponse.json({error:"Unable to inspect staff communication."},{status:500});
  }
}
