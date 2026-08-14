import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;

function database() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

export async function attachOutgoingMessageId(input: { phone: string; content: string; messageId: string }) {
  const db = database();
  if (!db) return false;
  const rows = await db.query(
    `UPDATE messages
     SET external_id=$3
     WHERE id=(
       SELECT id FROM messages
       WHERE phone=$1 AND role='assistant' AND content=$2 AND external_id IS NULL
       ORDER BY created_at DESC
       LIMIT 1
     )
     AND NOT EXISTS (SELECT 1 FROM messages WHERE external_id=$3)
     RETURNING id`,
    [input.phone, input.content, input.messageId]
  );
  return rows.length > 0;
}
