import React from "react";
import { ImageResponse } from "next/og";
import { getContentPost, type ContentPost } from "@/lib/content-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLORS = { green:"#0d725f", greenDark:"#075548", ink:"#102b28", mint:"#dff3ec", cream:"#f7f5ef", white:"#ffffff", muted:"#61736f" };

function Brand({logoSrc}:{logoSrc:string}){
  return React.createElement("div",{style:{display:"flex",alignItems:"center",width:154,height:62,padding:"5px 9px",borderRadius:12,background:"rgba(255,255,255,.98)",border:"1px solid rgba(16,43,40,.08)"}},
    React.createElement("img",{src:logoSrc,width:136,height:50,style:{width:136,height:50,objectFit:"contain"}}));
}

function Cta({text,light=false}:{text:string;light?:boolean}){
  return React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",padding:"10px 17px",borderRadius:999,background:light?COLORS.white:COLORS.green,color:light?COLORS.greenDark:COLORS.white,fontSize:17,fontWeight:850,maxWidth:300}},text);
}

function Label({text,dark=false}:{text:string;dark?:boolean}){
  return React.createElement("div",{style:{display:"flex",alignItems:"center",gap:9,color:dark?COLORS.green:"#9ee8d5",fontSize:12,fontWeight:900,letterSpacing:2.1}},
    React.createElement("span",{style:{width:26,height:3,borderRadius:999,background:dark?COLORS.green:"#58c8ac"}}),text);
}

function Promo({logoSrc,headline,support,cta,label}:{logoSrc:string;headline:string;support:string;cta:string;label:string}){
  const size=headline.length>54?47:56;
  return React.createElement("div",{style:{width:"100%",height:"100%",display:"flex",position:"relative",overflow:"hidden",background:COLORS.ink,padding:"42px 56px"}},
    React.createElement("div",{style:{position:"absolute",width:500,height:500,borderRadius:999,right:-210,top:-220,background:"#17443d"}}),
    React.createElement("div",{style:{position:"relative",zIndex:2,width:"100%",display:"flex",flexDirection:"column",justifyContent:"space-between"}},
      React.createElement(Brand,{logoSrc}),
      React.createElement("div",{style:{display:"flex",flexDirection:"column",maxWidth:790,gap:14}},
        React.createElement(Label,{text:label}),
        React.createElement("div",{style:{color:COLORS.white,fontSize:size,fontWeight:900,lineHeight:1.04,letterSpacing:-1.5,maxWidth:820}},headline),
        support?React.createElement("div",{style:{color:"#d7e9e4",fontSize:21,lineHeight:1.38,maxWidth:720}},support):null),
      React.createElement(Cta,{text:cta,light:true})
    ));
}

function Education({logoSrc,headline,support,cta,label,faq=false}:{logoSrc:string;headline:string;support:string;cta:string;label:string;faq?:boolean}){
  const size=headline.length>54?45:54;
  return React.createElement("div",{style:{width:"100%",height:"100%",display:"flex",background:COLORS.cream,padding:"42px 58px"}},
    React.createElement("div",{style:{width:"100%",display:"flex",flexDirection:"column",justifyContent:"space-between"}},
      React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},
        React.createElement(Brand,{logoSrc}),
        faq?React.createElement("div",{style:{padding:"8px 13px",borderRadius:999,background:COLORS.mint,color:COLORS.greenDark,fontSize:12,fontWeight:900}},"FAQ"):null),
      React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:14,maxWidth:900}},
        React.createElement(Label,{text:label,dark:true}),
        React.createElement("div",{style:{color:COLORS.ink,fontSize:size,fontWeight:900,lineHeight:1.05,letterSpacing:-1.35,maxWidth:900}},headline),
        support?React.createElement("div",{style:{color:"#435e59",fontSize:21,lineHeight:1.4,maxWidth:760}},support):null),
      React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},
        React.createElement(Cta,{text:cta}),
        React.createElement("div",{style:{color:COLORS.muted,fontSize:13}},"medmindslc.online"))
    ));
}

function Photo({logoSrc,photoSrc,headline,support,cta,label}:{logoSrc:string;photoSrc:string;headline:string;support:string;cta:string;label:string}){
  const size=headline.length>54?44:headline.length>38?50:57;
  return React.createElement("div",{style:{width:"100%",height:"100%",display:"flex",position:"relative",overflow:"hidden",background:COLORS.ink}},
    React.createElement("img",{src:photoSrc,width:1200,height:628,style:{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"72% 50%"}}),
    React.createElement("div",{style:{position:"absolute",inset:0,background:"linear-gradient(90deg,rgba(16,43,40,.28) 0%,rgba(16,43,40,.08) 48%,rgba(16,43,40,0) 72%)"}}),
    React.createElement("div",{style:{position:"relative",zIndex:2,width:"43%",height:"calc(100% - 64px)",margin:"32px 0 32px 34px",padding:"26px 28px",borderRadius:24,display:"flex",flexDirection:"column",justifyContent:"space-between",background:"rgba(7,85,72,.95)",border:"1px solid rgba(255,255,255,.13)",boxShadow:"0 18px 44px rgba(0,0,0,.24)"}},
      React.createElement(Brand,{logoSrc}),
      React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:13,maxWidth:455}},
        React.createElement(Label,{text:label}),
        React.createElement("div",{style:{color:COLORS.white,fontSize:size,fontWeight:900,lineHeight:1.02,letterSpacing:-1.35,maxWidth:450}},headline),
        support?React.createElement("div",{style:{color:"#eef8f5",fontSize:19,lineHeight:1.35,maxWidth:440}},support):null),
      React.createElement(Cta,{text:cta,light:true})
    ));
}

function compactSentence(value:string,max:number){
  const clean=value.replace(/\s+/g," ").trim();
  if(!clean)return "";
  const first=clean.split(/(?<=[.!?])\s+/)[0]||clean;
  if(first.length<=max)return first;
  const clipped=first.slice(0,max-1).replace(/\s+\S*$/," ").trim();
  return `${clipped || first.slice(0,max-1).trim()}…`;
}

function propsFor(post:ContentPost){
  const type=post.contentType.toLowerCase();
  const label=type.includes("medminds prep")?"MEDMINDS PREP":type.includes("research")||type.includes("data analysis")?"MEDMINDS RESEARCH":type.includes("digital")||type.includes("software")?"MEDMINDS DIGITAL":"MEDMINDS";
  return {
    headline:compactSentence(post.creativeHeadline||post.title||"MedMinds",64),
    support:compactSentence(post.creativeSupportingText||"",108),
    cta:compactSentence(post.creativeCta||"Message MedMinds",32),
    label
  };
}

export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;
  const post=await getContentPost(id);
  if(!post)return new Response("Creative not found",{status:404});
  const origin=new URL(request.url).origin;
  const logoSrc=`${origin}/medminds-logo.png`;
  const props=propsFor(post);
  let element:React.ReactElement;
  if(post.creativeVisualMode==="photo"&&post.photoGeneratedAt){
    const photoSrc=`${origin}/api/content/photo/${post.id}?v=${post.photoVersion||1}`;
    element=React.createElement(Photo,{...props,logoSrc,photoSrc});
  }else if(post.creativeTemplate==="education-card"){
    element=React.createElement(Education,{...props,logoSrc});
  }else if(post.creativeTemplate==="faq-notice"){
    element=React.createElement(Education,{...props,logoSrc,faq:true});
  }else{
    element=React.createElement(Promo,{...props,logoSrc});
  }
  const response=new ImageResponse(element,{width:1200,height:628});
  response.headers.set("Cache-Control","no-store, max-age=0");
  return response;
}
