import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export const contentStatuses = ["DRAFT", "REVIEW", "APPROVED"] as const;
export type ContentStatus = (typeof contentStatuses)[number];
export type CreativeTemplate = "promo-clean" | "education-card" | "faq-notice";
export type CreativeVisualMode = "graphic" | "photo";

export type ContentPost = {
  id: string;
  title: string;
  contentType: string;
  objective: string | null;
  audience: string | null;
  body: string;
  mediaUrl: string | null;
  status: ContentStatus;
  createdBy: string;
  approvedBy: string | null;
  creativeTemplate: CreativeTemplate;
  creativeVisualMode: CreativeVisualMode;
  creativeHeadline: string | null;
  creativeSupportingText: string | null;
  creativeCta: string | null;
  creativeGeneratedAt: string | null;
  creativeVersion: number;
  photoPrompt: string | null;
  photoScene: string | null;
  photoSubject: string | null;
  photoSetting: string | null;
  photoMood: string | null;
  photoStyle: string | null;
  photoGeneratedAt: string | null;
  photoVersion: number;
  createdAt: string;
  updatedAt: string;
};

type ContentPhoto = {
  postId: string;
  base64: string;
  mimeType: string;
  prompt: string | null;
  version: number;
};

let sql: NeonQueryFunction<false, false> | null = null;
let initialized: Promise<void> | null = null;
const memory = new Map<string, ContentPost>();
const photoMemory = new Map<string, ContentPhoto>();

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  sql ??= neon(url);
  return sql;
}

async function ensureTables(db: NeonQueryFunction<false, false>) {
  initialized ??= (async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS medminds_content_posts (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      content_type TEXT NOT NULL,
      objective TEXT,
      audience TEXT,
      body TEXT NOT NULL,
      media_url TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      created_by TEXT NOT NULL DEFAULT 'MedMinds Admin',
      approved_by TEXT,
      creative_template TEXT NOT NULL DEFAULT 'promo-clean',
      creative_visual_mode TEXT NOT NULL DEFAULT 'graphic',
      creative_headline TEXT,
      creative_supporting_text TEXT,
      creative_cta TEXT,
      creative_generated_at TIMESTAMPTZ,
      creative_version INTEGER NOT NULL DEFAULT 1,
      photo_prompt TEXT,
      photo_scene TEXT,
      photo_subject TEXT,
      photo_setting TEXT,
      photo_mood TEXT,
      photo_style TEXT,
      photo_generated_at TIMESTAMPTZ,
      photo_version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS medminds_content_photos (
      post_id UUID PRIMARY KEY REFERENCES medminds_content_posts(id) ON DELETE CASCADE,
      image_base64 TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/png',
      prompt TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  })();
  await initialized;
}

const COLUMNS = `id,title,content_type,objective,audience,body,media_url,status,created_by,approved_by,
  creative_template,creative_visual_mode,creative_headline,creative_supporting_text,creative_cta,
  creative_generated_at,creative_version,photo_prompt,photo_scene,photo_subject,photo_setting,
  photo_mood,photo_style,photo_generated_at,photo_version,created_at,updated_at`;

function mapRow(row: Record<string, unknown>): ContentPost {
  return {
    id: String(row.id),
    title: String(row.title),
    contentType: String(row.content_type),
    objective: row.objective ? String(row.objective) : null,
    audience: row.audience ? String(row.audience) : null,
    body: String(row.body),
    mediaUrl: row.media_url ? String(row.media_url) : null,
    status: String(row.status) as ContentStatus,
    createdBy: String(row.created_by || "MedMinds Admin"),
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    creativeTemplate: String(row.creative_template || "promo-clean") as CreativeTemplate,
    creativeVisualMode: String(row.creative_visual_mode || "graphic") as CreativeVisualMode,
    creativeHeadline: row.creative_headline ? String(row.creative_headline) : null,
    creativeSupportingText: row.creative_supporting_text ? String(row.creative_supporting_text) : null,
    creativeCta: row.creative_cta ? String(row.creative_cta) : null,
    creativeGeneratedAt: row.creative_generated_at ? new Date(String(row.creative_generated_at)).toISOString() : null,
    creativeVersion: Number(row.creative_version || 1),
    photoPrompt: row.photo_prompt ? String(row.photo_prompt) : null,
    photoScene: row.photo_scene ? String(row.photo_scene) : null,
    photoSubject: row.photo_subject ? String(row.photo_subject) : null,
    photoSetting: row.photo_setting ? String(row.photo_setting) : null,
    photoMood: row.photo_mood ? String(row.photo_mood) : null,
    photoStyle: row.photo_style ? String(row.photo_style) : null,
    photoGeneratedAt: row.photo_generated_at ? new Date(String(row.photo_generated_at)).toISOString() : null,
    photoVersion: Number(row.photo_version || 1),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export async function listContentPosts(limit = 100) {
  const db = database();
  if (!db) return [...memory.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
  await ensureTables(db);
  const rows = await db.query(`SELECT ${COLUMNS} FROM medminds_content_posts ORDER BY updated_at DESC LIMIT $1`, [limit]);
  return rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function getContentPost(id: string) {
  const db = database();
  if (!db) return memory.get(id) ?? null;
  await ensureTables(db);
  const rows = await db.query(`SELECT ${COLUMNS} FROM medminds_content_posts WHERE id=$1 LIMIT 1`, [id]);
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function saveContentPost(input: Partial<ContentPost> & Pick<ContentPost, "title" | "contentType" | "body">) {
  const now = new Date().toISOString();
  const existing = input.id ? await getContentPost(input.id) : null;
  const post: ContentPost = {
    id: input.id || randomUUID(),
    title: input.title.trim(),
    contentType: input.contentType.trim(),
    objective: input.objective?.trim() || null,
    audience: input.audience?.trim() || null,
    body: input.body.trim(),
    mediaUrl: input.mediaUrl === undefined ? (existing?.mediaUrl ?? null) : (input.mediaUrl?.trim() || null),
    status: input.status || existing?.status || "DRAFT",
    createdBy: existing?.createdBy || input.createdBy || "MedMinds Admin",
    approvedBy: input.approvedBy ?? existing?.approvedBy ?? null,
    creativeTemplate: input.creativeTemplate ?? existing?.creativeTemplate ?? "promo-clean",
    creativeVisualMode: input.creativeVisualMode ?? existing?.creativeVisualMode ?? "graphic",
    creativeHeadline: input.creativeHeadline ?? existing?.creativeHeadline ?? null,
    creativeSupportingText: input.creativeSupportingText ?? existing?.creativeSupportingText ?? null,
    creativeCta: input.creativeCta ?? existing?.creativeCta ?? null,
    creativeGeneratedAt: input.creativeGeneratedAt ?? existing?.creativeGeneratedAt ?? null,
    creativeVersion: input.creativeVersion ?? existing?.creativeVersion ?? 1,
    photoPrompt: input.photoPrompt ?? existing?.photoPrompt ?? null,
    photoScene: input.photoScene ?? existing?.photoScene ?? null,
    photoSubject: input.photoSubject ?? existing?.photoSubject ?? null,
    photoSetting: input.photoSetting ?? existing?.photoSetting ?? null,
    photoMood: input.photoMood ?? existing?.photoMood ?? null,
    photoStyle: input.photoStyle ?? existing?.photoStyle ?? null,
    photoGeneratedAt: input.photoGeneratedAt ?? existing?.photoGeneratedAt ?? null,
    photoVersion: input.photoVersion ?? existing?.photoVersion ?? 1,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  const db = database();
  if (!db) {
    memory.set(post.id, post);
    return post;
  }
  await ensureTables(db);
  const rows = await db.query(`INSERT INTO medminds_content_posts (
      id,title,content_type,objective,audience,body,media_url,status,created_by,approved_by,
      creative_template,creative_visual_mode,creative_headline,creative_supporting_text,creative_cta,
      creative_generated_at,creative_version,photo_prompt,photo_scene,photo_subject,photo_setting,
      photo_mood,photo_style,photo_generated_at,photo_version,created_at,updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
    ON CONFLICT (id) DO UPDATE SET
      title=EXCLUDED.title,content_type=EXCLUDED.content_type,objective=EXCLUDED.objective,audience=EXCLUDED.audience,
      body=EXCLUDED.body,media_url=EXCLUDED.media_url,status=EXCLUDED.status,approved_by=EXCLUDED.approved_by,
      creative_template=EXCLUDED.creative_template,creative_visual_mode=EXCLUDED.creative_visual_mode,
      creative_headline=EXCLUDED.creative_headline,creative_supporting_text=EXCLUDED.creative_supporting_text,
      creative_cta=EXCLUDED.creative_cta,creative_generated_at=EXCLUDED.creative_generated_at,
      creative_version=EXCLUDED.creative_version,photo_prompt=EXCLUDED.photo_prompt,photo_scene=EXCLUDED.photo_scene,
      photo_subject=EXCLUDED.photo_subject,photo_setting=EXCLUDED.photo_setting,photo_mood=EXCLUDED.photo_mood,
      photo_style=EXCLUDED.photo_style,photo_generated_at=EXCLUDED.photo_generated_at,
      photo_version=EXCLUDED.photo_version,updated_at=EXCLUDED.updated_at RETURNING ${COLUMNS}`,
    [post.id, post.title, post.contentType, post.objective, post.audience, post.body, post.mediaUrl, post.status,
      post.createdBy, post.approvedBy, post.creativeTemplate, post.creativeVisualMode, post.creativeHeadline,
      post.creativeSupportingText, post.creativeCta, post.creativeGeneratedAt, post.creativeVersion,
      post.photoPrompt, post.photoScene, post.photoSubject, post.photoSetting, post.photoMood, post.photoStyle,
      post.photoGeneratedAt, post.photoVersion, post.createdAt, post.updatedAt]);
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function saveContentPhoto(postId: string, base64: string, mimeType: string, prompt: string | null, version: number) {
  const photo: ContentPhoto = { postId, base64, mimeType: mimeType || "image/png", prompt, version };
  const db = database();
  if (!db) {
    photoMemory.set(postId, photo);
    return photo;
  }
  await ensureTables(db);
  await db.query(`INSERT INTO medminds_content_photos (post_id,image_base64,mime_type,prompt,version,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
    ON CONFLICT (post_id) DO UPDATE SET image_base64=EXCLUDED.image_base64,mime_type=EXCLUDED.mime_type,
    prompt=EXCLUDED.prompt,version=EXCLUDED.version,updated_at=NOW()`, [postId, base64, photo.mimeType, prompt, version]);
  return photo;
}

export async function getContentPhoto(postId: string): Promise<ContentPhoto | null> {
  const db = database();
  if (!db) return photoMemory.get(postId) ?? null;
  await ensureTables(db);
  const rows = await db.query(`SELECT post_id,image_base64,mime_type,prompt,version FROM medminds_content_photos WHERE post_id=$1 LIMIT 1`, [postId]);
  if (!rows[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  return { postId: String(row.post_id), base64: String(row.image_base64), mimeType: String(row.mime_type || "image/png"), prompt: row.prompt ? String(row.prompt) : null, version: Number(row.version || 1) };
}

export async function deleteContentPost(id: string) {
  const db = database();
  if (!db) {
    photoMemory.delete(id);
    return memory.delete(id);
  }
  await ensureTables(db);
  await db.query(`DELETE FROM medminds_content_posts WHERE id=$1`, [id]);
  return true;
}
