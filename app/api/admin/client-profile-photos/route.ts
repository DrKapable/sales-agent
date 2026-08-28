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

function decodeImageDataUrl(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (!match) return null;
  return { contentType: match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase(), bytes: Buffer.from(match[2], "base64") };
}

export async function GET(request: Request) {
  try {
    const sql = await ensureTable();
    if (!sql) return NextResponse.json({ photos: {} });

    const url = new URL(request.url);
    const requestedPhone = url.searchParams.get("phone");
    if (requestedPhone) {
      const parsedPhone = phoneSchema.safeParse(requestedPhone);
      if (!parsedPhone.success) return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
      const rows = await sql.query(`SELECT image_data_url,updated_at FROM client_profile_photos WHERE phone=$1 LIMIT 1`, [parsedPhone.data]);
      if (!rows.length) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=60" } });
      const image = decodeImageDataUrl(String(rows[0].image_data_url));
      if (!image) return NextResponse.json({ error: "Stored profile photo is invalid." }, { status: 500 });
      return new NextResponse(image.bytes, {
        headers: {
          "Content-Type": image.contentType,
          "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
          "ETag": `\"${new Date(String(rows[0].updated_at)).getTime()}\"`
        }
      });
    }

    const rows = await sql.query(`SELECT phone,updated_at FROM client_profile_photos ORDER BY updated_at DESC LIMIT 500`);
    const photos = Object.fromEntries(rows.map((row) => {
      const phone = String(row.phone).replace(/\D/g, "");
      const version = new Date(String(row.updated_at)).getTime();
      return [phone, { url: `/api/admin/client-profile-photos?phone=${encodeURIComponent(phone)}&v=${version}`, updatedAt: new Date(String(row.updated_at)).toISOString() }];
    }));
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
    const rows = await sql.query(`INSERT INTO client_profile_photos(phone,image_data_url,source,updated_at)
      VALUES($1,$2,'admin_upload',NOW())
      ON CONFLICT(phone) DO UPDATE SET image_data_url=$2,source='admin_upload',updated_at=NOW()
      RETURNING updated_at`, [phone, imageDataUrl]);
    const version = new Date(String(rows[0].updated_at)).getTime();
    return NextResponse.json({ ok: true, phone, photo: { url: `/api/admin/client-profile-photos?phone=${encodeURIComponent(phone)}&v=${version}`, updatedAt: new Date(String(rows[0].updated_at)).toISOString() } });
  } catch (error) {
    console.error("Client profile photo save failed", { phoneSuffix: phone.slice(-4), error });
    return NextResponse.json({ error: "Unable to save the client profile photo." }, { status: 500 });
  }
}
