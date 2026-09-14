import { getCanvaConnectionSecret, refreshCanvaConnectionNow } from "@/lib/canva-connection";

export class CanvaApiError extends Error {
  status: number;
  code: string | null;
  constructor(message:string,status=400,code:string|null=null){super(message);this.name="CanvaApiError";this.status=status;this.code=code;}
}

function apiUrl(path:string){return path.startsWith("http://")||path.startsWith("https://")?path:`https://api.canva.com/rest/v1${path.startsWith("/")?path:`/${path}`}`;}

export async function canvaApiFetch(path:string,init:RequestInit={}){
  let connection=await getCanvaConnectionSecret();
  if(!connection)throw new CanvaApiError("Reconnect Canva before using this feature.",409,"not_connected");

  const run=(token:string)=>{
    const headers=new Headers(init.headers);
    headers.set("Authorization",`Bearer ${token}`);
    return fetch(apiUrl(path),{...init,headers,cache:"no-store"});
  };

  let response=await run(connection.accessToken);
  if(response.status===401){
    try{
      const refreshed=await refreshCanvaConnectionNow();
      if(refreshed){connection=refreshed;response=await run(connection.accessToken);}
    }catch{
      throw new CanvaApiError("Your Canva session is no longer valid. Reconnect Canva and try again.",401,"reauthorization_required");
    }
  }
  return response;
}

export async function canvaJson<T=Record<string,unknown>>(path:string,init:RequestInit={}){
  const response=await canvaApiFetch(path,init);
  const data=await response.json().catch(()=>({})) as T & {message?:string;code?:string};
  if(!response.ok)throw new CanvaApiError(data.message||`Canva request failed with HTTP ${response.status}.`,response.status,data.code||null);
  return data;
}

export type CanvaDesignSummary = {
  id:string;
  title?:string;
  updated_at?:number;
  created_at?:number;
  page_count?:number;
  design_types?:string[];
  urls?:{edit_url?:string;view_url?:string};
  thumbnail?:{width?:number;height?:number;url?:string};
};

export async function getCanvaDesign(designId:string){
  const data=await canvaJson<{design?:CanvaDesignSummary}>(`/designs/${encodeURIComponent(designId)}`);
  if(!data.design?.id)throw new CanvaApiError("Canva returned no design metadata.",502,"missing_design");
  return data.design;
}

export function prepareCanvaEditUrl(editUrl:string,correlationState?:string){
  const url=new URL(editUrl);
  if(correlationState){
    const safe=correlationState.replace(/[^A-Za-z0-9._~-]/g,"-").slice(0,50);
    if(safe)url.searchParams.set("correlation_state",safe);
  }
  const appId=process.env.CANVA_APP_ID?.trim();
  if(appId)url.searchParams.set("app_id",appId);
  return url.toString();
}
