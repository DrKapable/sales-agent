type CaptionStyleInput = {
  contentType?: string | null;
  objective?: string | null;
  audience?: string | null;
};

const URL_LINE = /^https?:\/\//i;
const BULLET = /^(?:[-•]|✅|✓|✔|👉|📌|🎯|📚|🧠|🩺|🔬|📊|💻|✨)\s*/u;

function context(input: CaptionStyleInput) {
  return [input.contentType, input.objective, input.audience].filter(Boolean).join(" ").toLowerCase();
}

export function captionLeadEmoji(input: CaptionStyleInput) {
  const text = context(input);
  if (/nmcz|nurs|midwi/.test(text)) return "🩺";
  if (/preclinical|anatom|physiol|biochem|patholog|pharmacol/.test(text)) return "🧠";
  if (/qbank|exam|osce|medical student|mbchb|revision|internal medicine|stp|mmed/.test(text)) return "🎯";
  if (/research|proposal|dissertation|thesis|manuscript|academic writing/.test(text)) return "🔬";
  if (/data|statistics|analysis|zatafa|medstats/.test(text)) return "📊";
  if (/software|digital|web|automation|technology/.test(text)) return "💻";
  if (/course|teaching|learning|education/.test(text)) return "📚";
  return "✨";
}

function tidyLine(line: string) {
  return line.replace(/[ \t]+/g, " ").trim();
}

function splitFlatCaption(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= 2) return sentences;
  return [sentences[0], sentences.slice(1, 3).join(" "), ...sentences.slice(3)];
}

function normalizeBlocks(value: string) {
  const raw = value.replace(/\r\n?/g, "\n").trim();
  if (!raw) return [];
  const lines = raw.split("\n").map(tidyLine).filter(Boolean);
  if (lines.length === 1) {
    const sentences = lines[0].split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length >= 3 || lines[0].length > 180) return splitFlatCaption(lines[0]);
  }
  return lines;
}

function makeScannable(lines: string[]) {
  if (lines.length <= 2) return lines;
  const output: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    if (index === 0 || URL_LINE.test(line) || line.startsWith("#") || BULLET.test(line)) {
      output.push(line);
      continue;
    }
    if (line.length > 150 && /[.;:]/.test(line)) {
      const parts = line.split(/(?<=[.;:])\s+/).filter(Boolean);
      output.push(...parts.slice(0, 3));
      continue;
    }
    output.push(line);
  }
  return output;
}

function groupLines(lines: string[]) {
  if (!lines.length) return "";
  const blocks: string[] = [];
  let bulletBuffer: string[] = [];
  const flushBullets = () => {
    if (!bulletBuffer.length) return;
    blocks.push(bulletBuffer.join("\n"));
    bulletBuffer = [];
  };

  lines.forEach((line, index) => {
    const isBullet = BULLET.test(line);
    if (isBullet) {
      bulletBuffer.push(line);
      return;
    }
    flushBullets();
    if (index === 0 || URL_LINE.test(line) || line.startsWith("#")) blocks.push(line);
    else blocks.push(line);
  });
  flushBullets();
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function capHashtags(value: string) {
  let count = 0;
  return value
    .replace(/#[A-Za-z0-9_]+/g, (tag) => {
      count += 1;
      return count <= 3 ? tag : "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatPremiumCaption(value: string, _input: CaptionStyleInput = {}) {
  let lines = makeScannable(normalizeBlocks(value));
  if (!lines.length) return "";

  lines = lines.map((line) => {
    if (/^[-•]\s+/.test(line)) return `✅ ${line.replace(/^[-•]\s+/, "")}`;
    return line;
  });

  return capHashtags(groupLines(lines));
}
