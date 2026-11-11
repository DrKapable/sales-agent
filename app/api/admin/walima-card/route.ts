export const runtime="nodejs";
// /api/admin is protected by the application's session proxy.
export async function GET(request:Request) {
  const name=new URL(request.url).searchParams.get("name")?.trim();
  if(!name || name.length>120) return new Response("Invalid name",{status:400});
  const image=await fetch("https://juma-zabibu.medmindslc.online/api/invitation-card",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,attendance:"attending",side:"neither",count:1}),signal:AbortSignal.timeout(15000),cache:"no-store"});
  if(!image.ok) return new Response("Card unavailable",{status:502});
  return new Response(image.body,{headers:{"Content-Type":"image/png","Cache-Control":"private, no-store"}});
}
