import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_DATA_URL_LENGTH = 450_000;
const phoneSchema = z.string().min(8).max(30).transform((value) => value.replace(/\D/g, ""));
const saveSchema = z.object({
  phone: phoneSchema,
  imageDataUrl: z.string().max(MAX_DATA_URL_LENGTH).nullable()
});

function database() {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}

async function ensureTable() {
  const sql = database();
  if (!sql) return null;
  await sql.query(`CREATE TABLE IF NOT EXISTS client_profile_photos (
    phone TEXT PRIMARY KEY,
    image_data_url TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'admin_upload',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  return sql;
}

function validImageDataUrl(value: string) {
  return /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(value);
}

export async function GET() {
  try {
    const sql = await ensureTable();
    if (!sql) return NextResponse.json({ photos: {} });
    const rows = await sql.query(`SELECT phone,image_data_url FROM client_profile_photos ORDER BY updated_at DESC LIMIT 500`);
    const photos = Object.fromEntries(rows.map((row) => [String(row.phone).replace(/\D/g, ""), String(row.image_data_url)]));
    return NextResponse.json({ photos }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Client profile photo lookup failed", { error });
    return NextResponse.json({ error: "Unable to load client profile photos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile photo request." }, { status: 400 });
  const { phone, imageDataUrl } = parsed.data;
  if (imageDataUrl && !validImageDataUrl(imageDataUrl)) {
    return NextResponse.json({ error: "Only JPEG, PNG or WebP profile images are supported." }, { status: 400 });
  }

  try {
    const sql = await ensureTable();
    if (!sql) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
    if (!imageDataUrl) {
      await sql.query(`DELETE FROM client_profile_photos WHERE phone=$1`, [phone]);
      return NextResponse.json({ ok: true, phone, removed: true });
    }
    await sql.query(`INSERT INTO client_profile_photos(phone,image_data_url,source,updated_at)
      VALUES($1,$2,'admin_upload',NOW())
      ON CONFLICT(phone) DO UPDATE SET image_data_url=$2,source='admin_upload',updated_at=NOW()`, [phone, imageDataUrl]);
    return NextResponse.json({ ok: true, phone, imageDataUrl });
  } catch (error) {
    console.error("Client profile photo save failed", { phoneSuffix: phone.slice(-4), error });
    return NextResponse.json({ error: "Unable to save the client profile photo." }, { status: 500 });
  }
}
