import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runTeamNotifications } from "@/lib/internal-team-proactive";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request:Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({error:"Unauthorized"},{status:401});
  const mode=new URL(request.url).searchParams.get("mode");
  if(mode!=="daily"&&mode!=="attention")return NextResponse.json({error:"Invalid alert mode"},{status:400});
  try {
    const result=await runTeamNotifications(mode);
    return NextResponse.json({ok:true,...result});
  } catch(error) {
    console.error("Staff intelligence cron failed",{mode,error});
    return NextResponse.json({error:"Team intelligence cron failed."},{status:500});
  }
}
