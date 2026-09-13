import { NextResponse } from "next/server";
import { getContentPost, saveContentPost } from "@/lib/content-studio";
import { getCanvaConnectionSecret } from "@/lib/canva-connection";
import { getCanvaContentDesign, saveCanvaContentExport } from "@/lib/canva-content-designs";

function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}
function publicOrigin(request:Request){return process.env.PUBLIC_URL?.trim().replace(/\/+$/,"")||new URL(request.url).origin;}

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    const {id}=await context.params;
    const post=await getContentPost(id);
    if(!post)return NextResponse.json({error:"Content post not found."},{status:404});
    const linked=await getCanvaContentDesign(id);
    if(!linked)return NextResponse.json({error:"Create or link a Canva design first."},{status:409});
    const connection=await getCanvaConnectionSecret();
    if(!connection)return NextResponse.json({error:"Reconnect Canva before importing the final design."},{status:409});

    const create=await fetch("https://api.canva.com/rest/v1/exports",{method:"POST",headers:{Authorization:`Bearer ${connection.accessToken}`,"Content-Type":"application/json"},body:JSON.stringify({design_id:linked.designId,format:{type:"png"}}),cache:"no-store"});
    const created=await create.json().catch(()=>({})) as {job?:{id?:string;status?:string;urls?:string[];error?:{message?:string}};message?:string};
    if(!create.ok||!created.job?.id)return NextResponse.json({error:created.message||created.job?.error?.message||"Canva could not start the PNG export."},{status:create.status||400});

    let job=created.job;
    for(let i=0;i<10&&job.status==="in_progress";i++){
      await sleep(650);
      const check=await fetch(`https://api.canva.com/rest/v1/exports/${encodeURIComponent(created.job.id)}`,{headers:{Authorization:`Bearer ${connection.accessToken}`},cache:"no-store"});
      const data=await check.json().catch(()=>({})) as {job?:typeof job};
      if(data.job)job=data.job;
    }
    if(job.status!=="success"||!job.urls?.[0])return NextResponse.json({error:job.error?.message||"The Canva export is still processing. Try Import from Canva again in a moment."},{status:409});

    const image=await fetch(job.urls[0],{cache:"no-store"});
    if(!image.ok)return NextResponse.json({error:"Canva finished the export, but Sales Agent could not download the image."},{status:502});
    const mime=image.headers.get("content-type")||"image/png";
    if(!mime.startsWith("image/"))return NextResponse.json({error:"Canva export did not return an image."},{status:502});
    const buffer=Buffer.from(await image.arrayBuffer());
    if(!buffer.length||buffer.length>10*1024*1024)return NextResponse.json({error:"The Canva export is empty or larger than the 10 MB import limit."},{status:400});

    const version=Math.max(1,(post.creativeVersion||1)+1);
    const previewUrl=`/api/content/creative/${id}?v=${version}`;
    await saveCanvaContentExport({postId:id,designId:linked.designId,base64:buffer.toString("base64"),mimeType:mime.split(";")[0]||"image/png",creativeVersion:version});
    const updated=await saveContentPost({...post,creativeGeneratedAt:new Date().toISOString(),creativeVersion:version,mediaUrl:`${publicOrigin(request)}${previewUrl}`});
    return NextResponse.json({post:updated,previewUrl,source:"canva"});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to import Canva design."},{status:400});}
}
