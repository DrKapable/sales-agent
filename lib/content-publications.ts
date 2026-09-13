import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type PublicationStatus = "SCHEDULED" | "PUBLISHED" | "FAILED";

export type ContentPublication = {
  postId: string;
  status: PublicationStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  captionSnapshot: string;
  mediaUrlSnapshot: string;
  creativeVersion: number;
  externalPostId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

let sql: NeonQueryFunction<false, false> | null = null;
let initialized: Promise<void> | null = null;
const memory = new Map<string, ContentPublication>();

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  sql ??= neon(url);
  return sql;
}

async function ensureTable(db: NeonQueryFunction<false, false>) {
  initialized ??= (async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS medminds_content_publications (
      post_id UUID PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      scheduled_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      caption_snapshot TEXT NOT NULL,
      media_url_snapshot TEXT NOT NULL,
      creative_version INTEGER NOT NULL DEFAULT 1,
      external_post_id TEXT,
      failure_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  })();
  await initialized;
}

function mapRow(row: Record<string, unknown>): ContentPublication {
  return {
    postId: String(row.post_id),
    status: String(row.status) as PublicationStatus,
    scheduledAt: row.scheduled_at ? new Date(String(row.scheduled_at)).toISOString() : null,
    publishedAt: row.published_at ? new Date(String(row.published_at)).toISOString() : null,
    captionSnapshot: String(row.caption_snapshot || ""),
    mediaUrlSnapshot: String(row.media_url_snapshot || ""),
    creativeVersion: Number(row.creative_version || 1),
    externalPostId: row.external_post_id ? String(row.external_post_id) : null,
    failureReason: row.failure_reason ? String(row.failure_reason) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export async function schedulePublication(input: {
  postId: string;
  scheduledAt: string;
  captionSnapshot: string;
  mediaUrlSnapshot: string;
  creativeVersion: number;
}) {
  const now = new Date().toISOString();
  const item: ContentPublication = {
    postId: input.postId,
    status: "SCHEDULED",
    scheduledAt: new Date(input.scheduledAt).toISOString(),
    publishedAt: null,
    captionSnapshot: input.captionSnapshot.trim(),
    mediaUrlSnapshot: input.mediaUrlSnapshot.trim(),
    creativeVersion: Math.max(1, input.creativeVersion || 1),
    externalPostId: null,
    failureReason: null,
    createdAt: memory.get(input.postId)?.createdAt || now,
    updatedAt: now
  };

  const db = database();
  if (!db) {
    memory.set(item.postId, item);
    return item;
  }
  await ensureTable(db);
  const rows = await db.query(`INSERT INTO medminds_content_publications (
      post_id,status,scheduled_at,published_at,caption_snapshot,media_url_snapshot,creative_version,external_post_id,failure_reason,created_at,updated_at
    ) VALUES ($1,'SCHEDULED',$2,NULL,$3,$4,$5,NULL,NULL,NOW(),NOW())
    ON CONFLICT (post_id) DO UPDATE SET status='SCHEDULED',scheduled_at=EXCLUDED.scheduled_at,published_at=NULL,
      caption_snapshot=EXCLUDED.caption_snapshot,media_url_snapshot=EXCLUDED.media_url_snapshot,
      creative_version=EXCLUDED.creative_version,external_post_id=NULL,failure_reason=NULL,updated_at=NOW()
    RETURNING post_id,status,scheduled_at,published_at,caption_snapshot,media_url_snapshot,creative_version,external_post_id,failure_reason,created_at,updated_at`,
    [item.postId, item.scheduledAt, item.captionSnapshot, item.mediaUrlSnapshot, item.creativeVersion]);
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function getPublication(postId: string) {
  const db = database();
  if (!db) return memory.get(postId) ?? null;
  await ensureTable(db);
  const rows = await db.query(`SELECT post_id,status,scheduled_at,published_at,caption_snapshot,media_url_snapshot,creative_version,external_post_id,failure_reason,created_at,updated_at
    FROM medminds_content_publications WHERE post_id=$1 LIMIT 1`, [postId]);
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function listPublicationMap() {
  const db = database();
  if (!db) return new Map([...memory.values()].map((item) => [item.postId, item]));
  await ensureTable(db);
  const rows = await db.query(`SELECT post_id,status,scheduled_at,published_at,caption_snapshot,media_url_snapshot,creative_version,external_post_id,failure_reason,created_at,updated_at
    FROM medminds_content_publications`);
  return new Map(rows.map((row) => {
    const item = mapRow(row as Record<string, unknown>);
    return [item.postId, item] as const;
  }));
}

export async function cancelPublication(postId: string) {
  const db = database();
  if (!db) return memory.delete(postId);
  await ensureTable(db);
  await db.query(`DELETE FROM medminds_content_publications WHERE post_id=$1 AND status='SCHEDULED'`, [postId]);
  return true;
}
