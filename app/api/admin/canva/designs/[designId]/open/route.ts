import { NextResponse } from "next/server";
import { CanvaApiError, getCanvaDesign, prepareCanvaEditUrl } from "@/lib/canva-api";

function safeReturnTo(value:string|null){return value?.startsWith("/admin/")?value:"/admin/content";}

export async function GET(request:Request,context:{params:Promise<{designId:string}>}){
  const input=new URL(request.url).searchParams;
  const returnTo=safeReturnTo(input.get("returnTo"));
  try{
    const {designId}=await context.params;
    if(!designId||designId.length>160)throw new CanvaApiError("Invalid Canva design ID.",400,"invalid_design_id");
    const design=await getCanvaDesign(designId);
    if(!design.urls?.edit_url)throw new CanvaApiError("Canva did not return an editing link for this design.",502,"missing_edit_url");
    const state=input.get("state")?.trim()||undefined;
    return NextResponse.redirect(prepareCanvaEditUrl(design.urls.edit_url,state),302);
  }catch(error){
    const target=new URL(returnTo,new URL(request.url).origin);
    target.searchParams.set("canva_open","failed");
    target.searchParams.set("canva_open_error",error instanceof CanvaApiError?(error.code||"canva_error"):"canva_error");
    target.searchParams.set("canva_open_message",error instanceof Error?error.message:"Unable to open this Canva design.");
    return NextResponse.redirect(target,302);
  }
}
