import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export const publicationStatuses = ["SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED", "CANCELLED"] as const;
export type PublicationStatus = (typeof publicationStatuses)[number];

export type ContentPublication = {
  id: string;
  postId: string;
  status: PublicationStatus;
  scheduledAt: string | null;
  captionSnapshot: string;
  sourceMediaUrl: string;
  creativeVersion: number;
  publishedAt: string | null;
  facebookPostId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type PublicationAsset = { base64: string; mimeType: string };

let sql: NeonQueryFunction<false, false> | null = null;
let initialized: Promise<void> | null = null;
const memory = new Map<string, ContentPublication>();
const assets = new Map<string, PublicationAsset>();

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  sql ??= neon(url);
  return sql;
}

async function ensureTables(db: NeonQueryFunction<false, false>) {
  initialized ??= (async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS medminds_content_publications (
      id UUID PRIMARY KEY,
      post_id UUID NOT NULL,
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      scheduled_at TIMESTAMPTZ,
      caption_snapshot TEXT NOT NULL,
      source_media_url TEXT NOT NULL,
      creative_version INTEGER NOT NULL DEFAULT 1,
      media_base64 TEXT NOT NULL,
      media_mime TEXT NOT NULL DEFAULT 'image/png',
      published_at TIMESTAMPTZ,
      facebook_post_id TEXT,
      failure_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS medminds_content_publications_due_idx ON medminds_content_publications(status,scheduled_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS medminds_content_publications_post_idx ON medminds_content_publications(post_id,created_at DESC)`);
  })();
  await initialized;
}

const COLUMNS = `id,post_id,status,scheduled_at,caption_snapshot,source_media_url,creative_version,published_at,facebook_post_id,failure_reason,created_at,updated_at`;

function mapRow(row: Record<string, unknown>): ContentPublication {
  return {
    id: String(row.id),
    postId: String(row.post_id),
    status: String(row.status) as PublicationStatus,
    scheduledAt: row.scheduled_at ? new Date(String(row.scheduled_at)).toISOString() : null,
    captionSnapshot: String(row.caption_snapshot || ""),
    sourceMediaUrl: String(row.source_media_url || ""),
    creativeVersion: Number(row.creative_version || 1),
    publishedAt: row.published_at ? new Date(String(row.published_at)).toISOString() : null,
    facebookPostId: row.facebook_post_id ? String(row.facebook_post_id) : null,
    failureReason: row.failure_reason ? String(row.failure_reason) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export async function createPublication(input: {
  postId: string;
  scheduledAt: string | null;
  captionSnapshot: string;
  sourceMediaUrl: string;
  creativeVersion: number;
  mediaBase64: string;
  mediaMime: string;
}) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const item: ContentPublication = {
    id,
    postId: input.postId,
    status: "SCHEDULED",
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null,
    captionSnapshot: input.captionSnapshot.trim(),
    sourceMediaUrl: input.sourceMediaUrl,
    creativeVersion: Math.max(1, input.creativeVersion || 1),
    publishedAt: null,
    facebookPostId: null,
    failureReason: null,
    createdAt: now,
    updatedAt: now
  };
  const db = database();
  if (!db) {
    for (const existing of memory.values()) {
      if (existing.postId === item.postId && existing.status === "SCHEDULED") memory.set(existing.id, { ...existing, status: "CANCELLED", updatedAt: now });
    }
    memory.set(id, item);
    assets.set(id, { base64: input.mediaBase64, mimeType: input.mediaMime || "image/png" });
    return item;
  }
  await ensureTables(db);
  await db.query(`UPDATE medminds_content_publications SET status='CANCELLED',updated_at=NOW() WHERE post_id=$1 AND status='SCHEDULED'`, [input.postId]);
  const rows = await db.query(`INSERT INTO medminds_content_publications (
      id,post_id,status,scheduled_at,caption_snapshot,source_media_url,creative_version,media_base64,media_mime,created_at,updated_at
    ) VALUES ($1,$2,'SCHEDULED',$3,$4,$5,$6,$7,$8,NOW(),NOW()) RETURNING ${COLUMNS}`,
  [id, input.postId, item.scheduledAt, item.captionSnapshot, item.sourceMediaUrl, item.creativeVersion, input.mediaBase64, input.mediaMime || "image/png"]);
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function getPublication(id: string) {
  const db = database();
  if (!db) return memory.get(id) ?? null;
  await ensureTables(db);
  const rows = await db.query(`SELECT ${COLUMNS} FROM medminds_content_publications WHERE id=$1 LIMIT 1`, [id]);
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function getLatestPublication(postId: string) {
  const db = database();
  if (!db) {
    return [...memory.values()].filter((item) => item.postId === postId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }
  await ensureTables(db);
  const rows = await db.query(`SELECT ${COLUMNS} FROM medminds_content_publications WHERE post_id=$1 ORDER BY created_at DESC LIMIT 1`, [postId]);
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function listRecentPublications(limit = 150) {
  const db = database();
  if (!db) return [...memory.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  await ensureTables(db);
  const rows = await db.query(`SELECT ${COLUMNS} FROM medminds_content_publications ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function listDuePublications(limit = 20) {
  const db = database();
  if (!db) return [...memory.values()].filter((item) => item.status === "SCHEDULED" && item.scheduledAt && new Date(item.scheduledAt) <= new Date()).slice(0, limit);
  await ensureTables(db);
  const rows = await db.query(`SELECT ${COLUMNS} FROM medminds_content_publications
    WHERE status='SCHEDULED' AND scheduled_at IS NOT NULL AND scheduled_at<=NOW()
    ORDER BY scheduled_at ASC LIMIT $1`, [limit]);
  return rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function claimPublication(id: string) {
  const db = database();
  if (!db) {
    const item = memory.get(id);
    if (!item || item.status !== "SCHEDULED") return null;
    const updated = { ...item, status: "PUBLISHING" as const, updatedAt: new Date().toISOString() };
    memory.set(id, updated);
    return updated;
  }
  await ensureTables(db);
  const rows = await db.query(`UPDATE medminds_content_publications SET status='PUBLISHING',updated_at=NOW()
    WHERE id=$1 AND status='SCHEDULED' RETURNING ${COLUMNS}`, [id]);
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function markPublicationPublished(id: string, facebookPostId: string) {
  const db = database();
  if (!db) {
    const item = memory.get(id);
    if (!item) return null;
    const updated = { ...item, status: "PUBLISHED" as const, publishedAt: new Date().toISOString(), facebookPostId, failureReason: null, updatedAt: new Date().toISOString() };
    memory.set(id, updated);
    return updated;
  }
  await ensureTables(db);
  const rows = await db.query(`UPDATE medminds_content_publications SET status='PUBLISHED',published_at=NOW(),facebook_post_id=$2,failure_reason=NULL,updated_at=NOW() WHERE id=$1 RETURNING ${COLUMNS}`, [id, facebookPostId]);
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function markPublicationFailed(id: string, reason: string) {
  const db = database();
  if (!db) {
    const item = memory.get(id);
    if (!item) return null;
    const updated = { ...item, status: "FAILED" as const, failureReason: reason.slice(0, 1000), updatedAt: new Date().toISOString() };
    memory.set(id, updated);
    return updated;
  }
  await ensureTables(db);
  const rows = await db.query(`UPDATE medminds_content_publications SET status='FAILED',failure_reason=$2,updated_at=NOW() WHERE id=$1 RETURNING ${COLUMNS}`, [id, reason.slice(0, 1000)]);
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function cancelScheduledPublication(postId: string) {
  const now = new Date().toISOString();
  const db = database();
  if (!db) {
    let changed = false;
    for (const item of memory.values()) {
      if (item.postId === postId && item.status === "SCHEDULED") {
        memory.set(item.id, { ...item, status: "CANCELLED", updatedAt: now });
        changed = true;
      }
    }
    return changed;
  }
  await ensureTables(db);
  await db.query(`UPDATE medminds_content_publications SET status='CANCELLED',updated_at=NOW() WHERE post_id=$1 AND status='SCHEDULED'`, [postId]);
  return true;
}

export async function getPublicationAsset(id: string): Promise<PublicationAsset | null> {
  const db = database();
  if (!db) return assets.get(id) ?? null;
  await ensureTables(db);
  const rows = await db.query(`SELECT media_base64,media_mime FROM medminds_content_publications WHERE id=$1 LIMIT 1`, [id]);
  if (!rows[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  return { base64: String(row.media_base64), mimeType: String(row.media_mime || "image/png") };
}
