import { createHmac, timingSafeEqual } from "node:crypto";
import { invitationImport, importInvitations } from "@/lib/walima-inbox";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request) {
  const raw=await request.text();
  const secret=process.env.WHATSAPP_APP_SECRET;
  const stamp=request.headers.get("x-walima-timestamp") ?? "";
  if(!secret || raw.length>150000 || !/^\d+$/.test(stamp) || Math.abs(Date.now()-Number(stamp))>300000) return Response.json({error:"Invalid request"},{status:401});
  const expected=Buffer.from(createHmac("sha256",secret).update(`${stamp}.${raw}`).digest("hex"));
  const actual=Buffer.from(request.headers.get("x-walima-signature") ?? "");
  if(expected.length!==actual.length || !timingSafeEqual(expected,actual)) return Response.json({error:"Invalid signature"},{status:401});
  try {
    const input=invitationImport.parse(JSON.parse(raw));
    return Response.json(await importInvitations(input),{headers:{"Cache-Control":"no-store"}});
  } catch { return Response.json({error:"Invitation inbox import failed"},{status:503}); }
}
