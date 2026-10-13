import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type FollowUpAutomation = { paused: boolean; configured: boolean; updatedAt: string | null };

let sql: NeonQueryFunction<false, false> | null = null;
let initialized: Promise<void> | null = null;

async function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  const db = sql;
  initialized ??= db.query(`CREATE TABLE IF NOT EXISTS medminds_follow_up_automation (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    paused BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).then(() => undefined).catch((error) => {
    initialized = null;
    throw error;
  });
  await initialized;
  return db;
}

export async function getFollowUpAutomation(): Promise<FollowUpAutomation> {
  const db = await database();
  if (!db) return { paused: true, configured: false, updatedAt: null };
  const rows = await db.query(`SELECT paused, updated_at FROM medminds_follow_up_automation WHERE id = 1`);
  return {
    paused: rows[0]?.paused === true,
    configured: true,
    updatedAt: rows[0]?.updated_at ? new Date(String(rows[0].updated_at)).toISOString() : null
  };
}

export async function setFollowUpAutomationPaused(paused: boolean): Promise<FollowUpAutomation> {
  const db = await database();
  if (!db) throw new Error("Follow-up database is unavailable.");
  const rows = await db.query(`INSERT INTO medminds_follow_up_automation (id, paused, updated_at)
    VALUES (1, $1, NOW()) ON CONFLICT (id) DO UPDATE SET paused = EXCLUDED.paused, updated_at = NOW()
    RETURNING paused, updated_at`, [paused]);
  return { paused: rows[0].paused === true, configured: true, updatedAt: new Date(String(rows[0].updated_at)).toISOString() };
}
