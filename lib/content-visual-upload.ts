export const MAX_CONTENT_VISUAL_BYTES = 8 * 1024 * 1024;

export const contentVisualKinds = ["screenshot", "photo"] as const;
export type ContentVisualKind = (typeof contentVisualKinds)[number];

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXTENSION));

export function sanitizeContentVisualFilename(value: string) {
  const clean = String(value || "")
    .replace(/[\\/\0\r\n\t]+/g, "-")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  return clean || "medminds-visual";
}

export function resolveContentVisualMime(fileName: string, reportedMime: string) {
  const reported = String(reportedMime || "").toLowerCase().split(";")[0].trim();
  if (ALLOWED_MIME.has(reported)) return reported;
  const name = String(fileName || "").toLowerCase();
  const extension = Object.keys(MIME_BY_EXTENSION).find((item) => name.endsWith(item));
  return extension ? MIME_BY_EXTENSION[extension] : null;
}

export function normalizeContentVisualKind(value: unknown): ContentVisualKind {
  return value === "photo" ? "photo" : "screenshot";
}

export function contentVisualPrompt(kind: ContentVisualKind, fileName: string) {
  const label = kind === "photo" ? "real photo" : "platform screenshot";
  return `Uploaded ${label}: ${sanitizeContentVisualFilename(fileName)}`;
}

export function isUploadedContentVisual(prompt: string | null | undefined) {
  return /^Uploaded (?:real photo|platform screenshot):/i.test(String(prompt || ""));
}
