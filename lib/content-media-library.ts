import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export const contentMediaCategories = ["screenshot", "testimonial", "student-photo", "team-photo", "campaign"] as const;
export type ContentMediaCategory = (typeof contentMediaCategories)[number];

export type ContentMediaAsset = {
  id: string;
  title: string;
  category: ContentMediaCategory;
  fileName: string;
  mimeType: string;
  altText: string | null;
  tags: string[];
  usageCount: number;
  lastUsedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ContentMediaAssetBlob = ContentMediaAsset & { base64: string };

type MemoryAsset = ContentMediaAssetBlob;

let sql: NeonQueryFunction<false, false> | null = null;
let initialized: Promise<void> | null = null;
const memory = new Map<string, MemoryAsset>();

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  sql ??= neon(url);
  return sql;
}

function normalizeTags(value: unknown) {
  const input = Array.isArray(value) ? value : String(value || "").split(/[,|]/g);
  return [...new Set(input.map((item) => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

export function normalizeContentMediaCategory(value: unknown): ContentMediaCategory {
  return contentMediaCategories.includes(value as ContentMediaCategory) ? value as ContentMediaCategory : "screenshot";
}

export function contentMediaVisualKind(category: ContentMediaCategory): "screenshot" | "photo" {
  return category === "student-photo" || category === "team-photo" ? "photo" : "screenshot";
}

export function contentMediaCategoryLabel(category: ContentMediaCategory) {
  if (category === "student-photo") return "Student photo";
  if (category === "team-photo") return "Team photo";
  if (category === "testimonial") return "Testimonial";
  if (category === "campaign") return "Campaign asset";
  return "Platform screenshot";
}

async function ensureTable(db: NeonQueryFunction<false, false>) {
  initialized ??= (async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS medminds_content_media_assets (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      image_base64 TEXT NOT NULL,
      alt_text TEXT,
      tags TEXT NOT NULL DEFAULT '',
      usage_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TIMESTAMPTZ,
      created_by TEXT NOT NULL DEFAULT 'MedMinds Admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS medminds_content_media_assets_category_idx ON medminds_content_media_assets(category)`);
    await db.query(`CREATE INDEX IF NOT EXISTS medminds_content_media_assets_updated_idx ON medminds_content_media_assets(updated_at DESC)`);
  })();
  await initialized;
}

function mapRow(row: Record<string, unknown>): ContentMediaAsset {
  return {
    id: String(row.id),
    title: String(row.title || "MedMinds asset"),
    category: normalizeContentMediaCategory(row.category),
    fileName: String(row.file_name || "medminds-visual"),
    mimeType: String(row.mime_type || "image/png"),
    altText: row.alt_text ? String(row.alt_text) : null,
    tags: normalizeTags(row.tags),
    usageCount: Number(row.usage_count || 0),
    lastUsedAt: row.last_used_at ? new Date(String(row.last_used_at)).toISOString() : null,
    createdBy: String(row.created_by || "MedMinds Admin"),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export async function listContentMediaAssets(limit = 120) {
  const db = database();
  if (!db) return [...memory.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map(({ base64: _base64, ...asset }) => asset);
  await ensureTable(db);
  const rows = await db.query(`SELECT id,title,category,file_name,mime_type,alt_text,tags,usage_count,last_used_at,created_by,created_at,updated_at
    FROM medminds_content_media_assets ORDER BY updated_at DESC LIMIT $1`, [limit]);
  return rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function getContentMediaAsset(id: string): Promise<ContentMediaAssetBlob | null> {
  const db = database();
  if (!db) return memory.get(id) ?? null;
  await ensureTable(db);
  const rows = await db.query(`SELECT id,title,category,file_name,mime_type,image_base64,alt_text,tags,usage_count,last_used_at,created_by,created_at,updated_at
    FROM medminds_content_media_assets WHERE id=$1 LIMIT 1`, [id]);
  if (!rows[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  return { ...mapRow(row), base64: String(row.image_base64 || "") };
}

export async function saveContentMediaAsset(input: {
  title: string;
  category: ContentMediaCategory;
  fileName: string;
  mimeType: string;
  base64: string;
  altText?: string | null;
  tags?: string[] | string;
  createdBy?: string;
}) {
  const now = new Date().toISOString();
  const asset: ContentMediaAssetBlob = {
    id: randomUUID(),
    title: input.title.trim().slice(0, 180) || "MedMinds asset",
    category: normalizeContentMediaCategory(input.category),
    fileName: input.fileName.trim().slice(0, 180) || "medminds-visual",
    mimeType: input.mimeType.trim() || "image/png",
    base64: input.base64,
    altText: input.altText?.trim().slice(0, 300) || null,
    tags: normalizeTags(input.tags),
    usageCount: 0,
    lastUsedAt: null,
    createdBy: input.createdBy?.trim().slice(0, 120) || "MedMinds Admin",
    createdAt: now,
    updatedAt: now
  };

  const db = database();
  if (!db) {
    memory.set(asset.id, asset);
    return asset;
  }
  await ensureTable(db);
  const rows = await db.query(`INSERT INTO medminds_content_media_assets
    (id,title,category,file_name,mime_type,image_base64,alt_text,tags,usage_count,last_used_at,created_by,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,NULL,$9,NOW(),NOW())
    RETURNING id,title,category,file_name,mime_type,alt_text,tags,usage_count,last_used_at,created_by,created_at,updated_at`,
    [asset.id, asset.title, asset.category, asset.fileName, asset.mimeType, asset.base64, asset.altText, asset.tags.join("|"), asset.createdBy]);
  return { ...mapRow(rows[0] as Record<string, unknown>), base64: asset.base64 };
}

export async function markContentMediaAssetUsed(id: string) {
  const db = database();
  if (!db) {
    const asset = memory.get(id);
    if (!asset) return null;
    const now = new Date().toISOString();
    const updated = { ...asset, usageCount: asset.usageCount + 1, lastUsedAt: now, updatedAt: now };
    memory.set(id, updated);
    return updated;
  }
  await ensureTable(db);
  const rows = await db.query(`UPDATE medminds_content_media_assets
    SET usage_count=usage_count+1,last_used_at=NOW(),updated_at=NOW()
    WHERE id=$1
    RETURNING id,title,category,file_name,mime_type,alt_text,tags,usage_count,last_used_at,created_by,created_at,updated_at`, [id]);
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function deleteContentMediaAsset(id: string) {
  const db = database();
  if (!db) return memory.delete(id);
  await ensureTable(db);
  const rows = await db.query(`DELETE FROM medminds_content_media_assets WHERE id=$1 RETURNING id`, [id]);
  return Boolean(rows[0]);
}
