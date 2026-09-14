import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type CanvaContentDesign = { postId:string; designId:string; updatedAt:string };
export type CanvaContentExport = { postId:string; designId:string; base64:string; mimeType:string; creativeVersion:number; importedAt:string };

let sql:NeonQueryFunction<false,false>|null=null;let initialized:Promise<void>|null=null;
const linkMemory=new Map<string,CanvaContentDesign>();const exportMemory=new Map<string,CanvaContentExport>();
function database(){const url=process.env.DATABASE_URL?.trim();if(!url)return null;sql??=neon(url);return sql;}
async function ensureTables(db:NeonQueryFunction<false,false>){initialized??=(async()=>{
  await db.query(`CREATE TABLE IF NOT EXISTS medminds_canva_content_designs (
    post_id UUID PRIMARY KEY, design_id TEXT NOT NULL, edit_url TEXT, view_url TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`ALTER TABLE medminds_canva_content_designs ALTER COLUMN edit_url DROP NOT NULL`).catch(()=>undefined);
  await db.query(`CREATE TABLE IF NOT EXISTS medminds_canva_content_exports (
    post_id UUID PRIMARY KEY, design_id TEXT NOT NULL, image_base64 TEXT NOT NULL, mime_type TEXT NOT NULL DEFAULT 'image/png', creative_version INTEGER NOT NULL, imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
})();await initialized;}

export async function saveCanvaContentDesign(input:{postId:string;designId:string}){
  const item:CanvaContentDesign={postId:input.postId,designId:input.designId,updatedAt:new Date().toISOString()};
  const db=database();
  if(!db){linkMemory.set(item.postId,item);return item;}
  await ensureTables(db);
  await db.query(`INSERT INTO medminds_canva_content_designs (post_id,design_id,edit_url,view_url,updated_at) VALUES ($1,$2,NULL,NULL,NOW()) ON CONFLICT (post_id) DO UPDATE SET design_id=EXCLUDED.design_id,edit_url=NULL,view_url=NULL,updated_at=NOW()`,[item.postId,item.designId]);
  return item;
}

export async function getCanvaContentDesign(postId:string){
  const db=database();
  if(!db)return linkMemory.get(postId)||null;
  await ensureTables(db);
  const rows=await db.query(`SELECT post_id,design_id,updated_at FROM medminds_canva_content_designs WHERE post_id=$1 LIMIT 1`,[postId]);
  if(!rows[0])return null;
  const row=rows[0] as Record<string,unknown>;
  return {postId:String(row.post_id),designId:String(row.design_id),updatedAt:new Date(String(row.updated_at)).toISOString()} satisfies CanvaContentDesign;
}

export async function saveCanvaContentExport(input:{postId:string;designId:string;base64:string;mimeType:string;creativeVersion:number}){const item:CanvaContentExport={...input,importedAt:new Date().toISOString()};const db=database();if(!db){exportMemory.set(item.postId,item);return item;}await ensureTables(db);await db.query(`INSERT INTO medminds_canva_content_exports (post_id,design_id,image_base64,mime_type,creative_version,imported_at) VALUES ($1,$2,$3,$4,$5,NOW()) ON CONFLICT (post_id) DO UPDATE SET design_id=EXCLUDED.design_id,image_base64=EXCLUDED.image_base64,mime_type=EXCLUDED.mime_type,creative_version=EXCLUDED.creative_version,imported_at=NOW()`,[item.postId,item.designId,item.base64,item.mimeType,item.creativeVersion]);return item;}
export async function getCanvaContentExport(postId:string){const db=database();if(!db)return exportMemory.get(postId)||null;await ensureTables(db);const rows=await db.query(`SELECT post_id,design_id,image_base64,mime_type,creative_version,imported_at FROM medminds_canva_content_exports WHERE post_id=$1 LIMIT 1`,[postId]);if(!rows[0])return null;const row=rows[0] as Record<string,unknown>;return {postId:String(row.post_id),designId:String(row.design_id),base64:String(row.image_base64),mimeType:String(row.mime_type||"image/png"),creativeVersion:Number(row.creative_version||1),importedAt:new Date(String(row.imported_at)).toISOString()} satisfies CanvaContentExport;}
