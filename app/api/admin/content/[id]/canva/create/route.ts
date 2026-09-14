import { NextResponse } from "next/server";
import { z } from "zod";
import { getContentPost } from "@/lib/content-studio";
import { canvaPublicOrigin } from "@/lib/canva-connection";
import { CanvaApiError, canvaApiFetch, canvaJson } from "@/lib/canva-api";
import { saveCanvaContentDesign } from "@/lib/canva-content-designs";

const schema=z.object({
  templateId:z.string().trim().min(1).max(160).optional(),
  designId:z.string().trim().min(1).max(160).optional(),
  width:z.number().int().min(40).max(8000).optional(),
  height:z.number().int().min(40).max(8000).optional(),
  preset:z.enum(["presentation","doc","whiteboard","email"]).optional(),
  title:z.string().trim().min(1).max(255).optional(),
  source:z.enum(["current_creative"]).optional()
}).refine(value=>Boolean(value.templateId||value.designId||value.source||value.preset||(value.width&&value.height)),{message:"Choose a Canva creation option."});

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
type CanvaJob={id?:string;status?:string;asset?:{id?:string};error?:{message?:string}};

async function parseCanvaFailure(response:Response,fallback:string){
  const data=await response.json().catch(()=>({})) as {message?:string;code?:string};
  throw new CanvaApiError(data.message||fallback,response.status,data.code||null);
}

async function uploadCurrentCreative(input:{request:Request;postId:string;title:string;creativeVersion:number}){
  const origin=canvaPublicOrigin(input.request);
  const creativeUrl=`${origin}/api/content/creative/${encodeURIComponent(input.postId)}?v=${input.creativeVersion||1}`;
  const creative=await fetch(creativeUrl,{cache:"no-store"});
  if(!creative.ok)throw new CanvaApiError("Could not load the current MedMinds creative for Canva.",502,"creative_fetch_failed");
  const bytes=Buffer.from(await creative.arrayBuffer());
  if(!bytes.length)throw new CanvaApiError("The current MedMinds creative is empty.",400,"empty_creative");
  if(bytes.length>50*1024*1024)throw new CanvaApiError("The current creative is larger than Canva's 50 MB image upload limit.",400,"creative_too_large");

  const upload=await canvaApiFetch("/asset-uploads",{
    method:"POST",
    headers:{
      "Content-Type":"application/octet-stream",
      "Content-Length":String(bytes.length),
      "Asset-Upload-Metadata":JSON.stringify({name_base64:Buffer.from(`${input.title.slice(0,38)} creative`).toString("base64")})
    },
    body:bytes
  });
  if(!upload.ok)await parseCanvaFailure(upload,"Canva could not start the creative upload.");
  const created=await upload.json().catch(()=>({})) as {job?:CanvaJob};
  if(!created.job?.id)throw new CanvaApiError("Canva did not return an upload job ID.",502,"missing_upload_job");

  let job=created.job;
  for(let attempt=0;attempt<12&&job.status!=="success"&&job.status!=="failed";attempt++){
    await sleep(Math.min(1200,450+attempt*100));
    const check=await canvaApiFetch(`/asset-uploads/${encodeURIComponent(created.job.id)}`);
    if(!check.ok)await parseCanvaFailure(check,"Unable to check the Canva asset upload.");
    const result=await check.json().catch(()=>({})) as {job?:CanvaJob};
    if(result.job)job=result.job;
  }
  if(job.status==="failed")throw new CanvaApiError(job.error?.message||"Canva could not upload the current creative.",400,"asset_upload_failed");
  if(job.status!=="success"||!job.asset?.id)throw new CanvaApiError("Canva is still processing the creative. Try again in a moment.",409,"asset_processing");
  return job.asset.id;
}

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    const {id}=await context.params;
    const post=await getContentPost(id);
    if(!post)return NextResponse.json({error:"Content post not found."},{status:404});
    const parsed=schema.safeParse(await request.json().catch(()=>({})));
    if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||"Choose a valid Canva creation option."},{status:400});

    const title=(parsed.data.title||post.title||"MedMinds creative").slice(0,255);
    let body:Record<string,unknown>;

    if(parsed.data.templateId){
      body={type:"brand_template",brand_template_id:parsed.data.templateId};
    }else if(parsed.data.designId){
      body={type:"design",design_id:parsed.data.designId};
    }else if(parsed.data.source==="current_creative"){
      const assetId=await uploadCurrentCreative({request,postId:id,title,creativeVersion:Number(post.creativeVersion||1)});
      body={type:"type_and_asset",design_type:{type:"custom",width:1080,height:1080},asset_id:assetId,title};
    }else if(parsed.data.preset){
      body={type:"type_and_asset",design_type:{type:"preset",name:parsed.data.preset},title};
    }else{
      const width=parsed.data.width!;
      const height=parsed.data.height!;
      if(width*height>25_000_000)return NextResponse.json({error:"Canva custom designs cannot exceed 25,000,000 total pixels."},{status:400});
      body={type:"type_and_asset",design_type:{type:"custom",width,height},title};
    }

    const data=await canvaJson<{design?:{id?:string;urls?:{edit_url?:string;view_url?:string}}}>("/designs",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body)
    });
    if(!data.design?.id||!data.design.urls?.edit_url)throw new CanvaApiError("Canva created no usable editing link for the design.",502,"missing_edit_url");

    const linked=await saveCanvaContentDesign({postId:id,designId:data.design.id,editUrl:data.design.urls.edit_url,viewUrl:data.design.urls.view_url||null});
    const returnTo=`/admin/content/${id}/canva`;
    const openUrl=`/api/admin/canva/designs/${encodeURIComponent(data.design.id)}/open?state=${encodeURIComponent(`p-${id}`)}&returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.json({design:{...linked,openUrl}});
  }catch(error){
    const status=error instanceof CanvaApiError?error.status:400;
    const code=error instanceof CanvaApiError?error.code:null;
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to create Canva design.",code},{status});
  }
}
