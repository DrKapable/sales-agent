import { NextResponse } from "next/server";
import { getContentPost, saveContentPost } from "@/lib/content-studio";
import { CanvaApiError, canvaApiFetch, canvaJson, getCanvaDesign } from "@/lib/canva-api";
import { getCanvaContentDesign, saveCanvaContentExport } from "@/lib/canva-content-designs";

function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}
function publicOrigin(request:Request){return process.env.PUBLIC_URL?.trim().replace(/\/+$/,"")||new URL(request.url).origin;}
type ExportJob={id?:string;status?:string;urls?:string[];error?:{message?:string;code?:string}};
type ExportFormats=Record<string,{page_numbers?:number[]}>;

async function parseCanvaFailure(response:Response,fallback:string){
  const data=await response.json().catch(()=>({})) as {message?:string;code?:string};
  throw new CanvaApiError(data.message||fallback,response.status,data.code||null);
}

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    const {id}=await context.params;
    const post=await getContentPost(id);
    if(!post)return NextResponse.json({error:"Content post not found."},{status:404});
    const linked=await getCanvaContentDesign(id);
    if(!linked)return NextResponse.json({error:"Create or link a Canva design first."},{status:409});

    const [,formatResult]=await Promise.all([
      getCanvaDesign(linked.designId),
      canvaJson<{formats?:ExportFormats}>(`/designs/${encodeURIComponent(linked.designId)}/export-formats`)
    ]);
    if(!formatResult.formats?.png){
      const available=Object.keys(formatResult.formats||{});
      throw new CanvaApiError(`This Canva design cannot be imported as PNG.${available.length?` Available export formats: ${available.join(", ")}.`:""} Use a social/custom Canva design for the Sales Agent image.`,409,"png_not_supported");
    }

    const created=await canvaJson<{job?:ExportJob}>("/exports",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({design_id:linked.designId,format:{type:"png"}})
    });
    if(!created.job?.id)throw new CanvaApiError("Canva did not return an export job ID.",502,"missing_export_job");

    let job=created.job;
    for(let i=0;i<14&&job.status!=="success"&&job.status!=="failed";i++){
      await sleep(Math.min(1500,500+i*120));
      const check=await canvaApiFetch(`/exports/${encodeURIComponent(created.job.id)}`);
      if(!check.ok)await parseCanvaFailure(check,"Unable to check the Canva export.");
      const data=await check.json().catch(()=>({})) as {job?:ExportJob};
      if(data.job)job=data.job;
    }
    if(job.status==="failed")throw new CanvaApiError(job.error?.message||"Canva could not export this design.",400,job.error?.code||"export_failed");
    if(job.status!=="success"||!job.urls?.[0])throw new CanvaApiError("The Canva export is still processing. Try Import from Canva again in a moment.",409,"export_processing");

    const image=await fetch(job.urls[0],{cache:"no-store"});
    if(!image.ok)return NextResponse.json({error:"Canva finished the export, but Sales Agent could not download the exported image."},{status:502});
    const mime=image.headers.get("content-type")||"image/png";
    if(!mime.startsWith("image/"))return NextResponse.json({error:"Canva export did not return an image."},{status:502});
    const buffer=Buffer.from(await image.arrayBuffer());
    if(!buffer.length||buffer.length>10*1024*1024)return NextResponse.json({error:"The Canva export is empty or larger than the 10 MB import limit."},{status:400});

    const version=Math.max(1,(post.creativeVersion||1)+1);
    const previewUrl=`/api/content/creative/${id}?v=${version}`;
    await saveCanvaContentExport({postId:id,designId:linked.designId,base64:buffer.toString("base64"),mimeType:mime.split(";")[0]||"image/png",creativeVersion:version});
    const updated=await saveContentPost({...post,creativeGeneratedAt:new Date().toISOString(),creativeVersion:version,mediaUrl:`${publicOrigin(request)}${previewUrl}`});
    return NextResponse.json({post:updated,previewUrl,source:"canva",pageCount:job.urls?.length||1});
  }catch(error){
    const status=error instanceof CanvaApiError?error.status:400;
    const code=error instanceof CanvaApiError?error.code:null;
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to import Canva design.",code},{status});
  }
}
