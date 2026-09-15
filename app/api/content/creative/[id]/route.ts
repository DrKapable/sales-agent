import React from "react";
import { ImageResponse } from "next/og";
import { getContentPost, type ContentPost, type CreativeTemplate } from "@/lib/content-studio";
import { getCreativeSettings, type ContentCreativeSettings } from "@/lib/content-creative-settings";
import { creativeLayoutVariants, resolveCreativeLayout, type CreativeLayoutVariant } from "@/lib/content-creative-layout";
import { getCanvaContentExport } from "@/lib/canva-content-designs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const e = React.createElement;
const COLORS = { navy:"#17324d", teal:"#178e8b", tealLight:"#dff4f2", green:"#0d725f", cream:"#f5f7f4", grey:"#edf1f2", text:"#344b52", muted:"#6b7d82", white:"#ffffff" };
const templates: CreativeTemplate[] = ["promo-clean", "education-card", "faq-notice"];

type CreativeProps = { logoSrc:string; headline:string; support:string; cta:string; label:string; settings:ContentCreativeSettings };

function compactSentence(value:string,max:number){const clean=value.replace(/\s+/g," ").trim();if(!clean)return"";const first=clean.split(/(?<=[.!?])\s+/)[0]||clean;if(first.length<=max)return first;const clipped=first.slice(0,max-1).replace(/\s+\S*$/,"").trim();return`${clipped||first.slice(0,max-1).trim()}…`;}
function splitSupport(value:string,limit:number){const clean=value.replace(/\s+/g," ").trim();if(!clean||limit===0)return[];const parts=clean.split(/(?:\n+|[•;]|(?<=[.!?])\s+)/).map(v=>v.trim().replace(/[.!?]+$/,"").trim()).filter(Boolean);return(parts.length>1?parts:[clean]).slice(0,limit).map(item=>compactSentence(item,78));}
function clamp(value:number,min:number,max:number){return Math.min(max,Math.max(min,value));}
function numberParam(params:URLSearchParams,key:string,fallback:number,min:number,max:number){const raw=params.get(key);if(raw===null)return fallback;const value=Number(raw);return Number.isFinite(value)?clamp(value,min,max):fallback;}
function boolParam(params:URLSearchParams,key:string,fallback:boolean){const raw=params.get(key);if(raw===null)return fallback;return raw==="1"||raw==="true";}
function layoutParam(params:URLSearchParams,fallback:CreativeLayoutVariant){const raw=(params.get("layoutVariant")||fallback) as CreativeLayoutVariant;return creativeLayoutVariants.includes(raw)?raw:fallback;}

function Brand({logoSrc,centered=false}:{logoSrc:string;centered?:boolean}){
  return e("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",width:150,height:62,padding:"5px 8px",borderRadius:14,background:COLORS.white,boxShadow:"0 5px 16px rgba(23,50,77,.09)",marginLeft:centered?"auto":0,marginRight:centered?"auto":0}},e("img",{src:logoSrc,width:134,height:50,style:{width:134,height:50,objectFit:"contain"}}));
}
function Pill({text,scale=1}:{text:string;scale?:number}){
  if(!text.trim())return null;
  return e("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",minHeight:46*scale,padding:`${10*scale}px ${20*scale}px`,borderRadius:999,background:COLORS.green,color:COLORS.white,fontSize:24*scale,lineHeight:1,fontWeight:800,maxWidth:390,boxShadow:"0 7px 20px rgba(13,114,95,.15)"}},text);
}
function Category({text,light=false,scale=1}:{text:string;light?:boolean;scale?:number}){
  return e("div",{style:{display:"flex",alignItems:"center",gap:10,color:light?"#dff4f2":COLORS.teal,fontSize:19*scale,fontWeight:900,letterSpacing:2.1,textTransform:"uppercase"}},e("span",{style:{width:34,height:4,borderRadius:999,background:light?"#82d8cf":COLORS.teal}}),text);
}
function CheckRow({text,scale=1,align="left",compact=false}:{text:string;scale?:number;align?:"left"|"center";compact?:boolean}){
  return e("div",{style:{display:"flex",alignItems:"flex-start",gap:compact?10:14,color:COLORS.text,fontSize:(compact?25:29)*scale,lineHeight:1.26,fontWeight:650,textAlign:align}},e("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",flex:"0 0 auto",width:(compact?29:34)*scale,height:(compact?29:34)*scale,borderRadius:999,background:COLORS.green,color:COLORS.white,fontSize:(compact?17:21)*scale,fontWeight:900,marginTop:1}},"✓"),e("div",{style:{display:"flex",maxWidth:720}},text));
}
function Footer({cta,settings,scale=1}:{cta:string;settings:ContentCreativeSettings;scale?:number}){
  return e("div",{style:{display:"flex",alignItems:"center",justifyContent:cta?"space-between":"flex-end",gap:20,marginTop:"auto",width:"100%"}},cta?e(Pill,{text:cta,scale}):null,settings.showWebsite?e("div",{style:{color:COLORS.muted,fontSize:20,fontWeight:800}},"medmindslc.online"):null);
}

function Spotlight({logoSrc,headline,support,cta,label,settings}:CreativeProps){
  const scale=settings.textScale;const bullets=splitSupport(support,Math.min(2,settings.supportLines));const size=(headline.length>46?66:headline.length>30?76:88)*scale;
  const chips=bullets.map((item,index)=>e("div",{key:`chip-${index}`,style:{display:"flex",alignItems:"center",padding:"16px 20px",borderRadius:18,background:COLORS.white,boxShadow:"0 9px 24px rgba(23,50,77,.08)",maxWidth:410}},e(CheckRow,{text:item,scale:.88*scale,compact:true})));
  return e("div",{style:{width:"100%",height:"100%",display:"flex",position:"relative",overflow:"hidden",background:`linear-gradient(145deg,${COLORS.grey},${COLORS.white})`,fontFamily:"Arial, sans-serif"}},
    e("div",{style:{position:"absolute",width:520,height:520,borderRadius:999,right:-210,top:-230,background:"linear-gradient(145deg,#c8ece9,#82cbc5)"}}),
    e("div",{style:{position:"absolute",width:240,height:240,borderRadius:999,left:-100,bottom:-110,background:"linear-gradient(145deg,#178e8b,#0d725f)"}}),
    e("div",{style:{display:"flex",flexDirection:"column",width:"100%",height:"100%",padding:"66px 76px 68px",position:"relative",zIndex:2}},
      e(Brand,{logoSrc,centered:settings.logoPosition==="center"}),
      e("div",{style:{display:"flex",flexDirection:"column",alignItems:settings.textAlign==="center"?"center":"flex-start",maxWidth:900,marginTop:82}},
        e(Category,{text:label,scale}),
        e("div",{style:{color:COLORS.navy,fontSize:size,fontWeight:900,lineHeight:1.02,letterSpacing:-1.8,textTransform:"uppercase",marginTop:24,maxWidth:900,textAlign:settings.textAlign}},headline),
        chips.length?e("div",{style:{display:"flex",gap:14,marginTop:38,flexWrap:"wrap",maxWidth:880}},...chips):null
      ),
      e(Footer,{cta,settings,scale})
    )
  );
}

function Split({logoSrc,headline,support,cta,label,settings}:CreativeProps){
  const scale=settings.textScale;const bullets=splitSupport(support,Math.max(1,settings.supportLines));const size=(headline.length>48?63:headline.length>31?73:84)*scale;
  const benefitCards=bullets.slice(0,3).map((item,index)=>e("div",{key:`benefit-${index}`,style:{display:"flex",flexDirection:"column",padding:"22px 20px",borderRadius:20,background:COLORS.white,boxShadow:"0 12px 30px rgba(23,50,77,.09)",border:"1px solid #dfeceb"}},
    e("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",width:38,height:38,borderRadius:12,background:index===0?COLORS.green:COLORS.teal,color:COLORS.white,fontWeight:900,fontSize:20}},String(index+1)),
    e("div",{style:{display:"flex",color:COLORS.text,fontSize:24*scale,fontWeight:700,lineHeight:1.25,marginTop:12}},item)
  ));
  const left=e("div",{style:{display:"flex",flexDirection:"column",width:610,alignItems:settings.textAlign==="center"?"center":"flex-start"}},
    e(Category,{text:label,scale}),
    e("div",{style:{color:COLORS.navy,fontSize:size,fontWeight:900,lineHeight:1.03,letterSpacing:-1.5,textTransform:"uppercase",marginTop:22,textAlign:settings.textAlign}},headline),
    cta?e("div",{style:{display:"flex",marginTop:"auto"}},e(Pill,{text:cta,scale})):null
  );
  const right=e("div",{style:{display:"flex",flexDirection:"column",width:310,gap:16,justifyContent:"center"}},...benefitCards);
  return e("div",{style:{width:"100%",height:"100%",display:"flex",background:COLORS.white,fontFamily:"Arial, sans-serif",overflow:"hidden",position:"relative"}},
    e("div",{style:{position:"absolute",right:0,top:0,bottom:0,width:365,background:`linear-gradient(160deg,${COLORS.tealLight},#eef8f7)`}}),
    e("div",{style:{display:"flex",flexDirection:"column",width:"100%",height:"100%",padding:"66px 72px",position:"relative",zIndex:2}},
      e(Brand,{logoSrc,centered:settings.logoPosition==="center"}),
      e("div",{style:{display:"flex",gap:42,marginTop:66,flex:1,alignItems:"stretch"}},left,right),
      settings.showWebsite?e("div",{style:{position:"absolute",right:72,bottom:50,color:COLORS.muted,fontSize:18,fontWeight:800}},"MEDMINDS LEARNING CENTRE"):null
    )
  );
}

function Cards({logoSrc,headline,support,cta,label,settings}:CreativeProps){
  const scale=settings.textScale;const bullets=splitSupport(support,settings.supportLines);const size=(headline.length>46?61:headline.length>30?70:80)*scale;
  const items=(bullets.length?bullets:[compactSentence(support,88)]).filter(Boolean).slice(0,3);
  const cards=items.map((item,index)=>e("div",{key:`card-${index}`,style:{display:"flex",flexDirection:"column",flex:1,minHeight:218,padding:"26px 24px",borderRadius:22,background:index===0?COLORS.white:index===1?COLORS.tealLight:"#eaf1f5",boxShadow:"0 9px 26px rgba(23,50,77,.07)"}},
    e("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",width:42,height:42,borderRadius:14,background:index===1?COLORS.teal:COLORS.green,color:COLORS.white,fontSize:21,fontWeight:900}},"✓"),
    e("div",{style:{display:"flex",fontSize:25*scale,lineHeight:1.28,fontWeight:750,color:COLORS.text,marginTop:18}},item)
  ));
  return e("div",{style:{width:"100%",height:"100%",display:"flex",background:COLORS.cream,fontFamily:"Arial, sans-serif",position:"relative",overflow:"hidden"}},
    e("div",{style:{display:"flex",flexDirection:"column",width:"100%",height:"100%",padding:"62px 72px"}},
      e("div",{style:{display:"flex",alignItems:"center",justifyContent:settings.logoPosition==="center"?"center":"space-between"}},
        e(Brand,{logoSrc,centered:settings.logoPosition==="center"}),
        settings.logoPosition!=="center"?e(Category,{text:label,scale:.92*scale}):null
      ),
      e("div",{style:{color:COLORS.navy,fontSize:size,fontWeight:900,lineHeight:1.02,letterSpacing:-1.5,textTransform:"uppercase",marginTop:50,maxWidth:900,textAlign:settings.textAlign,alignSelf:settings.textAlign==="center"?"center":"flex-start"}},headline),
      e("div",{style:{display:"flex",gap:16,marginTop:34,width:"100%"}},...cards),
      e(Footer,{cta,settings,scale:.96*scale})
    )
  );
}

function Editorial({logoSrc,headline,support,cta,label,settings}:CreativeProps){
  const scale=settings.textScale;const size=(headline.length>48?64:headline.length>31?74:84)*scale;
  return e("div",{style:{width:"100%",height:"100%",display:"flex",background:COLORS.white,fontFamily:"Arial, sans-serif",position:"relative",overflow:"hidden"}},
    e("div",{style:{width:118,height:"100%",background:`linear-gradient(180deg,${COLORS.navy},${COLORS.green})`}}),
    e("div",{style:{display:"flex",flexDirection:"column",flex:1,padding:"66px 76px 68px"}},
      e(Brand,{logoSrc,centered:settings.logoPosition==="center"}),
      e("div",{style:{display:"flex",alignItems:"flex-start",gap:34,marginTop:72}},
        e("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",width:92,height:92,borderRadius:28,background:COLORS.tealLight,color:COLORS.teal,fontSize:46,fontWeight:900,flex:"0 0 auto"}},"01"),
        e("div",{style:{display:"flex",flexDirection:"column",maxWidth:690,alignItems:settings.textAlign==="center"?"center":"flex-start"}},
          e(Category,{text:label,scale}),
          e("div",{style:{color:COLORS.navy,fontSize:size,fontWeight:900,lineHeight:1.03,letterSpacing:-1.5,textTransform:"uppercase",marginTop:20,textAlign:settings.textAlign}},headline),
          support?e("div",{style:{display:"flex",color:COLORS.text,fontSize:29*scale,lineHeight:1.38,fontWeight:600,marginTop:30,maxWidth:700,textAlign:settings.textAlign}},compactSentence(support,170)):null
        )
      ),
      e(Footer,{cta,settings,scale})
    )
  );
}

function DataGrid({logoSrc,headline,support,cta,label,settings}:CreativeProps){
  const scale=settings.textScale;const size=(headline.length>45?60:headline.length>28?69:78)*scale;
  const bars=[76,48,88,62].map((width,index)=>e("div",{key:`bar-${index}`,style:{display:"flex",alignItems:"center",height:68,padding:"0 16px",borderRadius:16,background:"rgba(255,255,255,.10)",border:"1px solid rgba(255,255,255,.12)"}},e("div",{style:{height:13,width:`${width}%`,borderRadius:999,background:index%2?"#82d8cf":"#ffffff"}})));
  return e("div",{style:{width:"100%",height:"100%",display:"flex",background:`linear-gradient(145deg,${COLORS.navy},#214a61)`,fontFamily:"Arial, sans-serif",position:"relative",overflow:"hidden"}},
    e("div",{style:{position:"absolute",right:-80,top:150,width:460,height:460,borderRadius:999,border:"42px solid rgba(23,142,139,.22)"}}),
    e("div",{style:{display:"flex",flexDirection:"column",width:"100%",height:"100%",padding:"64px 70px",position:"relative",zIndex:2}},
      e(Brand,{logoSrc,centered:settings.logoPosition==="center"}),
      e("div",{style:{display:"flex",gap:40,marginTop:62,flex:1}},
        e("div",{style:{display:"flex",flexDirection:"column",width:580}},
          e(Category,{text:label,light:true,scale}),
          e("div",{style:{color:COLORS.white,fontSize:size,fontWeight:900,lineHeight:1.03,letterSpacing:-1.5,textTransform:"uppercase",marginTop:22}},headline),
          support?e("div",{style:{display:"flex",color:"#e9f4f4",fontSize:27*scale,lineHeight:1.36,fontWeight:550,marginTop:28}},compactSentence(support,155)):null,
          cta?e("div",{style:{display:"flex",marginTop:"auto"}},e(Pill,{text:cta,scale})):null
        ),
        e("div",{style:{display:"flex",flexDirection:"column",width:300,justifyContent:"center",gap:15}},...bars)
      ),
      settings.showWebsite?e("div",{style:{position:"absolute",right:70,bottom:42,color:"#cce1e3",fontSize:18,fontWeight:800}},"medmindslc.online"):null
    )
  );
}

function FAQ({logoSrc,headline,support,cta,label,settings}:CreativeProps){
  const scale=settings.textScale;const size=(headline.length>48?60:headline.length>30?70:82)*scale;
  return e("div",{style:{width:"100%",height:"100%",display:"flex",background:COLORS.white,fontFamily:"Arial, sans-serif",position:"relative",overflow:"hidden"}},
    e("div",{style:{position:"absolute",right:-100,top:-80,width:420,height:420,borderRadius:999,background:COLORS.tealLight}}),
    e("div",{style:{display:"flex",flexDirection:"column",width:"100%",height:"100%",padding:"66px 74px",position:"relative",zIndex:2}},
      e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},e(Brand,{logoSrc,centered:settings.logoPosition==="center"}),settings.logoPosition!=="center"?e("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",width:88,height:88,borderRadius:24,background:COLORS.teal,color:COLORS.white,fontSize:52,fontWeight:900}},"?"):null),
      e("div",{style:{display:"flex",flexDirection:"column",marginTop:72,maxWidth:860,alignItems:settings.textAlign==="center"?"center":"flex-start"}},
        e(Category,{text:`${label} FAQ`,scale}),
        e("div",{style:{color:COLORS.navy,fontSize:size,fontWeight:900,lineHeight:1.03,letterSpacing:-1.5,textTransform:"uppercase",marginTop:22,textAlign:settings.textAlign}},headline),
        support?e("div",{style:{display:"flex",marginTop:36,padding:"30px 32px",borderRadius:22,background:COLORS.cream,color:COLORS.text,fontSize:29*scale,lineHeight:1.36,fontWeight:620,boxShadow:"0 9px 25px rgba(23,50,77,.06)",textAlign:settings.textAlign}},compactSentence(support,170)):null
      ),
      e(Footer,{cta,settings,scale})
    )
  );
}

function Photo({logoSrc,photoSrc,headline,support,cta,label,settings,layout}:{logoSrc:string;photoSrc:string;headline:string;support:string;cta:string;label:string;settings:ContentCreativeSettings;layout:Exclude<CreativeLayoutVariant,"auto">}){
  const scale=settings.textScale;const headlineSize=(headline.length>46?59:headline.length>30?68:78)*scale;const bullets=splitSupport(support,Math.min(2,settings.supportLines));const bottom=layout==="spotlight"||layout==="editorial";
  const bulletNodes=bullets.map((item,index)=>e(CheckRow,{key:`photo-${index}`,text:item,scale:.88*scale,align:settings.textAlign,compact:true}));
  const cardStyle=bottom?{display:"flex",flexDirection:"column" as const,marginTop:"auto",width:850,padding:"30px 34px 32px",borderRadius:24,background:`rgba(255,255,255,${settings.cardOpacity})`,boxShadow:"0 14px 36px rgba(23,50,77,.16)",alignSelf:settings.textAlign==="center"?"center":"flex-start",alignItems:settings.textAlign==="center"?"center":"flex-start"}:{display:"flex",flexDirection:"column" as const,width:555,marginTop:64,padding:"32px 34px 34px",borderRadius:22,background:`rgba(255,255,255,${settings.cardOpacity})`,boxShadow:"0 14px 36px rgba(23,50,77,.14)",alignItems:settings.textAlign==="center"?"center":"flex-start"};
  return e("div",{style:{width:"100%",height:"100%",display:"flex",position:"relative",overflow:"hidden",background:COLORS.grey,fontFamily:"Arial, sans-serif"}},
    e("img",{src:photoSrc,width:1080,height:1080,style:{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:`${settings.photoX}% ${settings.photoY}%`,transform:`scale(${settings.photoZoom})`}}),
    e("div",{style:{position:"absolute",inset:0,background:bottom?"linear-gradient(0deg,rgba(10,35,45,.82) 0%,rgba(10,35,45,.18) 55%,rgba(10,35,45,.04) 100%)":"linear-gradient(90deg,rgba(237,241,242,.95) 0%,rgba(237,241,242,.82) 44%,rgba(237,241,242,.10) 70%,rgba(237,241,242,0) 100%)"}}),
    e("div",{style:{width:"100%",height:"100%",display:"flex",flexDirection:"column",position:"relative",zIndex:2,padding:"62px 68px"}},
      e(Brand,{logoSrc,centered:settings.logoPosition==="center"}),
      e("div",{style:cardStyle},
        e(Category,{text:label,scale}),
        e("div",{style:{color:COLORS.navy,fontSize:headlineSize,fontWeight:900,lineHeight:1.02,letterSpacing:-1.5,marginTop:18,textTransform:"uppercase",textAlign:settings.textAlign}},headline),
        bulletNodes.length?e("div",{style:{display:"flex",flexDirection:bottom?"row":"column",gap:bottom?18:15,marginTop:24,flexWrap:"wrap"}},...bulletNodes):null,
        cta?e("div",{style:{display:"flex",marginTop:26}},e(Pill,{text:cta,scale:.94*scale})):null
      )
    )
  );
}

function propsFor(post:ContentPost,params?:URLSearchParams){
  const type=post.contentType.toLowerCase();
  const label=type.includes("medminds prep")?"MEDMINDS PREP":type.includes("research")||type.includes("data analysis")?"MEDMINDS RESEARCH":type.includes("digital")||type.includes("software")?"MEDMINDS DIGITAL":type.includes("course")?"MEDMINDS LEARNING":"MEDMINDS";
  const pick=(key:string,fallback:string)=>params?.has(key)?String(params.get(key)||""):fallback;
  const hideCta=params?.has("hideCta")?boolParam(params,"hideCta",post.creativeCtaHidden):post.creativeCtaHidden;
  return{headline:compactSentence(pick("headline",post.creativeHeadline||post.title||"MedMinds"),58),support:compactSentence(pick("supportingText",post.creativeSupportingText||""),175),cta:hideCta?"":compactSentence(pick("cta",post.creativeCta||"Message MedMinds"),32),label};
}
function editorSettings(saved:ContentCreativeSettings,params:URLSearchParams):ContentCreativeSettings{return{...saved,textScale:numberParam(params,"textScale",saved.textScale,.75,1.25),supportLines:Math.round(numberParam(params,"supportLines",saved.supportLines,0,3)),photoX:Math.round(numberParam(params,"photoX",saved.photoX,0,100)),photoY:Math.round(numberParam(params,"photoY",saved.photoY,0,100)),photoZoom:numberParam(params,"photoZoom",saved.photoZoom,1,1.45),cardOpacity:numberParam(params,"cardOpacity",saved.cardOpacity,.72,1),logoPosition:params.get("logoPosition")==="center"?"center":params.get("logoPosition")==="left"?"left":saved.logoPosition,textAlign:params.get("textAlign")==="center"?"center":params.get("textAlign")==="left"?"left":saved.textAlign,showWebsite:boolParam(params,"showWebsite",saved.showWebsite),layoutVariant:layoutParam(params,saved.layoutVariant)};}

export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;const post=await getContentPost(id);if(!post)return new Response("Creative not found",{status:404});
  const url=new URL(request.url);const params=url.searchParams;const isEditorPreview=params.get("editorPreview")==="1";
  const canva=await getCanvaContentExport(id);if(!isEditorPreview&&canva&&canva.creativeVersion===post.creativeVersion){return new Response(Buffer.from(canva.base64,"base64"),{headers:{"Content-Type":canva.mimeType,"Cache-Control":"no-store, max-age=0","X-MedMinds-Creative-Format":"canva-import"}});}
  const savedSettings=await getCreativeSettings(id);const settings=isEditorPreview?editorSettings(savedSettings,params):savedSettings;const origin=url.origin;const logoSrc=`${origin}/medminds-logo.png`;const props=propsFor(post,isEditorPreview?params:undefined);
  const templateRaw=isEditorPreview?params.get("template"):null;const template=templateRaw&&templates.includes(templateRaw as CreativeTemplate)?templateRaw as CreativeTemplate:post.creativeTemplate;
  const requestedLayout=isEditorPreview?layoutParam(params,settings.layoutVariant):settings.layoutVariant;let layout=resolveCreativeLayout(post,requestedLayout);if(template==="faq-notice"&&requestedLayout==="auto")layout="faq";
  let element:React.ReactElement;
  if(post.creativeVisualMode==="photo"&&post.photoGeneratedAt){const photoSrc=`${origin}/api/content/photo/${post.id}?v=${post.photoVersion||1}`;element=e(Photo,{...props,logoSrc,photoSrc,settings,layout});}
  else if(layout==="faq")element=e(FAQ,{...props,logoSrc,settings});
  else if(layout==="data-grid")element=e(DataGrid,{...props,logoSrc,settings});
  else if(layout==="cards")element=e(Cards,{...props,logoSrc,settings});
  else if(layout==="editorial")element=e(Editorial,{...props,logoSrc,settings});
  else if(layout==="split")element=e(Split,{...props,logoSrc,settings});
  else element=e(Spotlight,{...props,logoSrc,settings});
  const response=new ImageResponse(element,{width:1080,height:1080});response.headers.set("Cache-Control","no-store, max-age=0");response.headers.set("X-MedMinds-Creative-Format","facebook-square-1080");response.headers.set("X-MedMinds-Layout",layout);return response;
}