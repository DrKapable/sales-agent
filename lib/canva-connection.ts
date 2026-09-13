import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type CanvaConnectionStatus = {
  configured: boolean;
  connected: boolean;
  connectedAt: string | null;
  expiresAt: string | null;
};

export type CanvaCredentialCheck = {
  attempted: boolean;
  valid: boolean | null;
  code: string | null;
  message: string | null;
};

type StoredCanvaConnection = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  connectedAt: string;
};

let sql: NeonQueryFunction<false, false> | null = null;
let initialized: Promise<void> | null = null;
let memory: StoredCanvaConnection | null = null;

function database(){const url=process.env.DATABASE_URL?.trim();if(!url)return null;sql??=neon(url);return sql;}
async function ensureTable(db:NeonQueryFunction<false,false>){initialized??=(async()=>{await db.query(`CREATE TABLE IF NOT EXISTS medminds_canva_connection (
  connection_key TEXT PRIMARY KEY,
  access_token_cipher TEXT NOT NULL,
  refresh_token_cipher TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);})();await initialized;}

function secret(){const value=process.env.CANVA_TOKEN_ENCRYPTION_KEY?.trim()||process.env.SESSION_SECRET?.trim();if(!value)throw new Error("Canva token encryption requires SESSION_SECRET or CANVA_TOKEN_ENCRYPTION_KEY.");return createHash("sha256").update(value).digest();}
function encrypt(value:string){const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",secret(),iv);const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);const tag=cipher.getAuthTag();return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;}
function decrypt(value:string){const [ivPart,tagPart,dataPart]=value.split(".");if(!ivPart||!tagPart||!dataPart)throw new Error("Stored Canva token is invalid.");const decipher=createDecipheriv("aes-256-gcm",secret(),Buffer.from(ivPart,"base64url"));decipher.setAuthTag(Buffer.from(tagPart,"base64url"));return Buffer.concat([decipher.update(Buffer.from(dataPart,"base64url")),decipher.final()]).toString("utf8");}

export function getCanvaConfig(){const clientId=process.env.CANVA_CLIENT_ID?.trim()||"";const clientSecret=process.env.CANVA_CLIENT_SECRET?.trim()||"";return {clientId,clientSecret,oauthConfigured:Boolean(clientId&&clientSecret),scopes:["design:content:read","design:content:write","design:meta:read","brandtemplate:meta:read","brandtemplate:content:read","profile:read"]};}
export function canvaPublicOrigin(request:Request){return process.env.PUBLIC_URL?.trim().replace(/\/+$/,"")||new URL(request.url).origin;}

export async function validateCanvaCredentials():Promise<CanvaCredentialCheck>{
  const config=getCanvaConfig();
  if(!config.oauthConfigured)return {attempted:false,valid:false,code:"not_configured",message:"Canva OAuth credentials are not configured."};
  try{
    const response=await fetch("https://api.canva.com/rest/v1/oauth/token",{
      method:"POST",
      headers:{Authorization:`Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({grant_type:"refresh_token",refresh_token:"medminds-canva-credential-validation"}),
      cache:"no-store"
    });
    const data=await response.json().catch(()=>({})) as {code?:string;message?:string};
    const code=data.code||null;
    if(code==="invalid_grant")return {attempted:true,valid:true,code,message:data.message||null};
    if(code==="invalid_client")return {attempted:true,valid:false,code,message:data.message||"Canva rejected the configured client secret."};
    return {attempted:true,valid:null,code,message:data.message||`Canva credential validation returned HTTP ${response.status}.`};
  }catch(error){
    return {attempted:true,valid:null,code:"network_error",message:error instanceof Error?error.message:"Unable to validate Canva credentials."};
  }
}

export async function saveCanvaConnection(input:{accessToken:string;refreshToken:string;expiresIn:number}){const now=new Date();const item:StoredCanvaConnection={accessToken:input.accessToken.trim(),refreshToken:input.refreshToken.trim(),expiresAt:new Date(now.getTime()+Math.max(60,input.expiresIn||14400)*1000).toISOString(),connectedAt:now.toISOString()};const db=database();if(!db){memory=item;return item;}await ensureTable(db);await db.query(`INSERT INTO medminds_canva_connection (connection_key,access_token_cipher,refresh_token_cipher,expires_at,connected_at,updated_at)
VALUES ('primary',$1,$2,$3,NOW(),NOW()) ON CONFLICT (connection_key) DO UPDATE SET access_token_cipher=EXCLUDED.access_token_cipher,refresh_token_cipher=EXCLUDED.refresh_token_cipher,expires_at=EXCLUDED.expires_at,connected_at=NOW(),updated_at=NOW()`,[encrypt(item.accessToken),encrypt(item.refreshToken),item.expiresAt]);return item;}

async function readStored():Promise<StoredCanvaConnection|null>{const db=database();if(!db)return memory;await ensureTable(db);const rows=await db.query(`SELECT access_token_cipher,refresh_token_cipher,expires_at,connected_at FROM medminds_canva_connection WHERE connection_key='primary' LIMIT 1`);if(!rows[0])return null;const row=rows[0] as Record<string,unknown>;return {accessToken:decrypt(String(row.access_token_cipher)),refreshToken:decrypt(String(row.refresh_token_cipher)),expiresAt:new Date(String(row.expires_at)).toISOString(),connectedAt:new Date(String(row.connected_at)).toISOString()};}

async function refreshConnection(item:StoredCanvaConnection){const config=getCanvaConfig();if(!config.oauthConfigured)throw new Error("Canva OAuth is not configured.");const response=await fetch("https://api.canva.com/rest/v1/oauth/token",{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:item.refreshToken}),cache:"no-store"});const data=await response.json().catch(()=>({})) as {access_token?:string;refresh_token?:string;expires_in?:number;message?:string};if(!response.ok||!data.access_token)throw new Error(data.message||"Canva access expired. Reconnect Canva.");return saveCanvaConnection({accessToken:data.access_token,refreshToken:data.refresh_token||item.refreshToken,expiresIn:Number(data.expires_in||14400)});}

export async function getCanvaConnectionSecret(){const item=await readStored();if(!item)return null;if(new Date(item.expiresAt).getTime()<=Date.now()+60_000)return refreshConnection(item);return item;}
export async function getCanvaConnectionStatus():Promise<CanvaConnectionStatus>{const config=getCanvaConfig();const item=await readStored().catch(()=>null);return {configured:config.oauthConfigured,connected:Boolean(item),connectedAt:item?.connectedAt||null,expiresAt:item?.expiresAt||null};}
export async function deleteCanvaConnection(){memory=null;const db=database();if(!db)return true;await ensureTable(db);await db.query(`DELETE FROM medminds_canva_connection WHERE connection_key='primary'`);return true;}

function stateSecret(){const value=process.env.SESSION_SECRET?.trim();if(!value)throw new Error("SESSION_SECRET is required for Canva OAuth.");return value;}
export function createCanvaOAuthState(returnTo:string){const safe=returnTo.startsWith("/admin/")?returnTo:"/admin/content";const payload=Buffer.from(JSON.stringify({returnTo:safe,ts:Date.now(),nonce:randomBytes(12).toString("hex")})).toString("base64url");const sig=createHmac("sha256",stateSecret()).update(payload).digest("base64url");return `${payload}.${sig}`;}
export function verifyCanvaOAuthState(state:string){const [payload,sig]=state.split(".");if(!payload||!sig)throw new Error("Invalid Canva OAuth state.");const expected=createHmac("sha256",stateSecret()).update(payload).digest();const actual=Buffer.from(sig,"base64url");if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new Error("Invalid Canva OAuth state.");const decoded=JSON.parse(Buffer.from(payload,"base64url").toString("utf8")) as {returnTo?:string;ts?:number};if(!decoded.ts||Date.now()-decoded.ts>15*60*1000)throw new Error("Canva OAuth request expired. Please connect again.");return {returnTo:decoded.returnTo?.startsWith("/admin/")?decoded.returnTo:"/admin/content"};}
export function createCanvaPkce(){const verifier=randomBytes(48).toString("base64url");const challenge=createHash("sha256").update(verifier).digest("base64url");return {verifier,challenge};}
