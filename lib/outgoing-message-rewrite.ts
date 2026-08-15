import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

export async function rewriteLatestUnsentAssistantMessage(input: { phone: string; from: string; to: string }) {
  if (input.from === input.to) return true;
  const db = database();
  if (!db) return false;
  const rows = await db.query(
    `UPDATE messages SET content=$3
     WHERE id=(
       SELECT id FROM messages
       WHERE phone=$1 AND role='assistant' AND content=$2 AND external_id IS NULL
       ORDER BY created_at DESC LIMIT 1
     )
     RETURNING id`,
    [input.phone, input.from, input.to]
  );
  return rows.length > 0;
}
