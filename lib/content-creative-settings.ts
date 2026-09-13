import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { creativeLayoutVariants, type CreativeLayoutVariant } from "@/lib/content-creative-layout";

export type CreativeLogoPosition = "left" | "center";
export type CreativeTextAlign = "left" | "center";

export type ContentCreativeSettings = {
  postId: string;
  textScale: number;
  supportLines: number;
  photoX: number;
  photoY: number;
  photoZoom: number;
  cardOpacity: number;
  logoPosition: CreativeLogoPosition;
  textAlign: CreativeTextAlign;
  showWebsite: boolean;
  layoutVariant: CreativeLayoutVariant;
  updatedAt: string;
};

export const defaultCreativeSettings: Omit<ContentCreativeSettings, "postId" | "updatedAt"> = {
  textScale: 1,
  supportLines: 3,
  photoX: 74,
  photoY: 50,
  photoZoom: 1,
  cardOpacity: 0.94,
  logoPosition: "left",
  textAlign: "left",
  showWebsite: true,
  layoutVariant: "auto"
};

let sql: NeonQueryFunction<false, false> | null = null;
let initialized: Promise<void> | null = null;
const memory = new Map<string, ContentCreativeSettings>();

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  sql ??= neon(url);
  return sql;
}

async function ensureTable(db: NeonQueryFunction<false, false>) {
  initialized ??= (async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS medminds_content_creative_settings (
      post_id UUID PRIMARY KEY,
      text_scale DOUBLE PRECISION NOT NULL DEFAULT 1,
      support_lines INTEGER NOT NULL DEFAULT 3,
      photo_x INTEGER NOT NULL DEFAULT 74,
      photo_y INTEGER NOT NULL DEFAULT 50,
      photo_zoom DOUBLE PRECISION NOT NULL DEFAULT 1,
      card_opacity DOUBLE PRECISION NOT NULL DEFAULT 0.94,
      logo_position TEXT NOT NULL DEFAULT 'left',
      text_align TEXT NOT NULL DEFAULT 'left',
      show_website BOOLEAN NOT NULL DEFAULT TRUE,
      layout_variant TEXT NOT NULL DEFAULT 'auto',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`ALTER TABLE medminds_content_creative_settings ADD COLUMN IF NOT EXISTS layout_variant TEXT NOT NULL DEFAULT 'auto'`);
  })();
  await initialized;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLayout(value: unknown): CreativeLayoutVariant {
  const candidate = String(value || "auto") as CreativeLayoutVariant;
  return creativeLayoutVariants.includes(candidate) ? candidate : "auto";
}

function normalize(postId: string, input: Partial<ContentCreativeSettings>): ContentCreativeSettings {
  return {
    postId,
    textScale: clamp(Number(input.textScale ?? defaultCreativeSettings.textScale), 0.75, 1.25),
    supportLines: Math.round(clamp(Number(input.supportLines ?? defaultCreativeSettings.supportLines), 0, 3)),
    photoX: Math.round(clamp(Number(input.photoX ?? defaultCreativeSettings.photoX), 0, 100)),
    photoY: Math.round(clamp(Number(input.photoY ?? defaultCreativeSettings.photoY), 0, 100)),
    photoZoom: clamp(Number(input.photoZoom ?? defaultCreativeSettings.photoZoom), 1, 1.45),
    cardOpacity: clamp(Number(input.cardOpacity ?? defaultCreativeSettings.cardOpacity), 0.72, 1),
    logoPosition: input.logoPosition === "center" ? "center" : "left",
    textAlign: input.textAlign === "center" ? "center" : "left",
    showWebsite: input.showWebsite ?? defaultCreativeSettings.showWebsite,
    layoutVariant: normalizeLayout(input.layoutVariant),
    updatedAt: new Date().toISOString()
  };
}

export async function getCreativeSettings(postId: string): Promise<ContentCreativeSettings> {
  const db = database();
  if (!db) return memory.get(postId) ?? normalize(postId, {});
  await ensureTable(db);
  const rows = await db.query(`SELECT post_id,text_scale,support_lines,photo_x,photo_y,photo_zoom,card_opacity,logo_position,text_align,show_website,layout_variant,updated_at
    FROM medminds_content_creative_settings WHERE post_id=$1 LIMIT 1`, [postId]);
  if (!rows[0]) return normalize(postId, {});
  const row = rows[0] as Record<string, unknown>;
  return normalize(postId, {
    textScale: Number(row.text_scale),
    supportLines: Number(row.support_lines),
    photoX: Number(row.photo_x),
    photoY: Number(row.photo_y),
    photoZoom: Number(row.photo_zoom),
    cardOpacity: Number(row.card_opacity),
    logoPosition: String(row.logo_position) as CreativeLogoPosition,
    textAlign: String(row.text_align) as CreativeTextAlign,
    showWebsite: Boolean(row.show_website),
    layoutVariant: normalizeLayout(row.layout_variant),
    updatedAt: String(row.updated_at)
  });
}

export async function saveCreativeSettings(postId: string, input: Partial<ContentCreativeSettings>) {
  const current = await getCreativeSettings(postId);
  const item = normalize(postId, { ...current, ...input });
  const db = database();
  if (!db) {
    memory.set(postId, item);
    return item;
  }
  await ensureTable(db);
  const rows = await db.query(`INSERT INTO medminds_content_creative_settings (
      post_id,text_scale,support_lines,photo_x,photo_y,photo_zoom,card_opacity,logo_position,text_align,show_website,layout_variant,updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
    ON CONFLICT (post_id) DO UPDATE SET
      text_scale=EXCLUDED.text_scale,support_lines=EXCLUDED.support_lines,photo_x=EXCLUDED.photo_x,photo_y=EXCLUDED.photo_y,
      photo_zoom=EXCLUDED.photo_zoom,card_opacity=EXCLUDED.card_opacity,logo_position=EXCLUDED.logo_position,
      text_align=EXCLUDED.text_align,show_website=EXCLUDED.show_website,layout_variant=EXCLUDED.layout_variant,updated_at=NOW()
    RETURNING post_id,text_scale,support_lines,photo_x,photo_y,photo_zoom,card_opacity,logo_position,text_align,show_website,layout_variant,updated_at`,
  [postId,item.textScale,item.supportLines,item.photoX,item.photoY,item.photoZoom,item.cardOpacity,item.logoPosition,item.textAlign,item.showWebsite,item.layoutVariant]);
  const row = rows[0] as Record<string, unknown>;
  return normalize(postId, {
    textScale: Number(row.text_scale), supportLines: Number(row.support_lines), photoX: Number(row.photo_x), photoY: Number(row.photo_y),
    photoZoom: Number(row.photo_zoom), cardOpacity: Number(row.card_opacity), logoPosition: String(row.logo_position) as CreativeLogoPosition,
    textAlign: String(row.text_align) as CreativeTextAlign, showWebsite: Boolean(row.show_website), layoutVariant: normalizeLayout(row.layout_variant), updatedAt: String(row.updated_at)
  });
}
