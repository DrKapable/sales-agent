import { NextResponse } from "next/server";
import { z } from "zod";
import { getContentPost } from "@/lib/content-studio";
import { getCanvaConnectionSecret } from "@/lib/canva-connection";
import { saveCanvaContentDesign } from "@/lib/canva-content-designs";

const schema=z.object({templateId:z.string().trim().min(1).max(120)});

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    const {id}=await context.params;
    const post=await getContentPost(id);
    if(!post)return NextResponse.json({error:"Content post not found."},{status:404});
    const parsed=schema.safeParse(await request.json().catch(()=>({})));
    if(!parsed.success)return NextResponse.json({error:"Choose a valid Canva Brand Template."},{status:400});
    const connection=await getCanvaConnectionSecret();
    if(!connection)return NextResponse.json({error:"Connect Canva first."},{status:409});
    const response=await fetch("https://api.canva.com/rest/v1/designs",{method:"POST",headers:{Authorization:`Bearer ${connection.accessToken}`,"Content-Type":"application/json"},body:JSON.stringify({type:"brand_template",brand_template_id:parsed.data.templateId}),cache:"no-store"});
    const data=await response.json().catch(()=>({})) as {design?:{id?:string;urls?:{edit_url?:string;view_url?:string}};message?:string};
    if(!response.ok||!data.design?.id||!data.design.urls?.edit_url)return NextResponse.json({error:data.message||"Canva could not create a design from this template. You can still open the template directly in Canva."},{status:response.status||400});
    const edit=new URL(data.design.urls.edit_url);
    edit.searchParams.set("correlation_state",id);
    const linked=await saveCanvaContentDesign({postId:id,designId:data.design.id,editUrl:edit.toString(),viewUrl:data.design.urls.view_url||null});
    return NextResponse.json({design:linked});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to create Canva design."},{status:400});}
}
