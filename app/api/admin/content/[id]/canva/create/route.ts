import { NextResponse } from "next/server";
import { z } from "zod";
import { getContentPost } from "@/lib/content-studio";
import { canvaPublicOrigin, getCanvaConnectionSecret } from "@/lib/canva-connection";
import { saveCanvaContentDesign } from "@/lib/canva-content-designs";

const schema=z.object({
  templateId:z.string().trim().min(1).max(120).optional(),
  designId:z.string().trim().min(1).max(120).optional(),
  width:z.number().int().min(40).max(8000).optional(),
  height:z.number().int().min(40).max(8000).optional(),
  title:z.string().trim().min(1).max(255).optional(),
  source:z.enum(["current_creative"]).optional()
}).refine(value=>Boolean(value.templateId||value.designId||value.source||(value.width&&value.height)),{message:"Choose a Canva creation option."});

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

type CanvaJob={id?:string;status?:string;asset?:{id?:string};error?:{message?:string}};

async function uploadCurrentCreative(input:{request:Request;postId:string;title:string;creativeVersion:number;accessToken:string}){
  const origin=canvaPublicOrigin(input.request);
  const creativeUrl=`${origin}/api/content/creative/${encodeURIComponent(input.postId)}?v=${input.creativeVersion||1}`;
  const creative=await fetch(creativeUrl,{cache:"no-store"});
  if(!creative.ok)throw new Error("Could not load the current MedMinds creative for Canva.");
  const bytes=Buffer.from(await creative.arrayBuffer());
  if(!bytes.length)throw new Error("The current MedMinds creative is empty.");

  const upload=await fetch("https://api.canva.com/rest/v1/asset-uploads",{
    method:"POST",
    headers:{
      Authorization:`Bearer ${input.accessToken}`,
      "Content-Type":"application/octet-stream",
      "Content-Length":String(bytes.length),
      "Asset-Upload-Metadata":JSON.stringify({name_base64:Buffer.from(`${input.title.slice(0,38)} creative`).toString("base64")})
    },
    body:bytes,
    cache:"no-store"
  });
  const created=await upload.json().catch(()=>({})) as {job?:CanvaJob;message?:string};
  if(!upload.ok||!created.job?.id)throw new Error(created.message||"Canva could not start the creative upload.");

  let job=created.job;
  for(let attempt=0;attempt<10&&job.status!=="success"&&job.status!=="failed";attempt++){
    await sleep(500);
    const check=await fetch(`https://api.canva.com/rest/v1/asset-uploads/${encodeURIComponent(created.job.id)}`,{
      headers:{Authorization:`Bearer ${input.accessToken}`},
      cache:"no-store"
    });
    const result=await check.json().catch(()=>({})) as {job?:CanvaJob;message?:string};
    if(!check.ok)throw new Error(result.message||"Unable to check the Canva asset upload.");
    if(result.job)job=result.job;
  }
  if(job.status==="failed")throw new Error(job.error?.message||"Canva could not upload the current creative.");
  if(job.status!=="success"||!job.asset?.id)throw new Error("Canva is still processing the creative. Try again in a moment.");
  return job.asset.id;
}

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    const {id}=await context.params;
    const post=await getContentPost(id);
    if(!post)return NextResponse.json({error:"Content post not found."},{status:404});
    const parsed=schema.safeParse(await request.json().catch(()=>({})));
    if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||"Choose a valid Canva creation option."},{status:400});
    const connection=await getCanvaConnectionSecret();
    if(!connection)return NextResponse.json({error:"Connect Canva first."},{status:409});

    const title=(parsed.data.title||post.title||"MedMinds creative").slice(0,255);
    let body:Record<string,unknown>;

    if(parsed.data.templateId){
      body={type:"brand_template",brand_template_id:parsed.data.templateId,page_numbers:[1]};
    }else if(parsed.data.designId){
      body={type:"design",design_id:parsed.data.designId};
    }else if(parsed.data.source==="current_creative"){
      const assetId=await uploadCurrentCreative({request,postId:id,title,creativeVersion:Number(post.creativeVersion||1),accessToken:connection.accessToken});
      body={type:"type_and_asset",design_type:{type:"custom",width:1080,height:1080},asset_id:assetId,title};
    }else{
      const width=parsed.data.width!;
      const height=parsed.data.height!;
      if(width*height>25_000_000)return NextResponse.json({error:"Canva custom designs cannot exceed 25,000,000 total pixels."},{status:400});
      body={type:"type_and_asset",design_type:{type:"custom",width,height},title};
    }

    const response=await fetch("https://api.canva.com/rest/v1/designs",{
      method:"POST",
      headers:{Authorization:`Bearer ${connection.accessToken}`,"Content-Type":"application/json"},
      body:JSON.stringify(body),
      cache:"no-store"
    });
    const data=await response.json().catch(()=>({})) as {design?:{id?:string;urls?:{edit_url?:string;view_url?:string}};message?:string;code?:string};
    if(!response.ok||!data.design?.id||!data.design.urls?.edit_url)return NextResponse.json({error:data.message||"Canva could not create the design.",code:data.code||null},{status:response.status||400});

    const edit=new URL(data.design.urls.edit_url);
    edit.searchParams.set("correlation_state",id);
    const linked=await saveCanvaContentDesign({postId:id,designId:data.design.id,editUrl:edit.toString(),viewUrl:data.design.urls.view_url||null});
    return NextResponse.json({design:linked});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to create Canva design."},{status:400});
  }
}
