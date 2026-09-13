export const AI_STYLE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bin today'?s (?:fast-paced|rapidly changing|digital) world\b/i, label: "generic 'today's world' opening" },
  { pattern: /\bunlock (?:your|the) potential\b/i, label: "'unlock your potential'" },
  { pattern: /\btake (?:your|the) [^.!?\n]{1,60} to the next level\b/i, label: "'take it to the next level'" },
  { pattern: /\bharness the power of\b/i, label: "'harness the power of'" },
  { pattern: /\bgame[- ]changer\b/i, label: "'game changer'" },
  { pattern: /\brevolutioni[sz]e\b/i, label: "'revolutionise'" },
  { pattern: /\belevate your\b/i, label: "'elevate your'" },
  { pattern: /\btransform your\b/i, label: "'transform your'" },
  { pattern: /\bdelve into\b/i, label: "'delve into'" },
  { pattern: /\bdive into\b/i, label: "'dive into'" },
  { pattern: /\bseamless(?:ly)?\b/i, label: "'seamless'" },
  { pattern: /\bembark on (?:a|your|this) journey\b/i, label: "journey language" },
  { pattern: /\byour journey starts here\b/i, label: "'your journey starts here'" },
  { pattern: /\b(?:discover|explore) a world of\b/i, label: "'a world of' marketing phrase" },
  { pattern: /\bat [A-Za-z0-9 &]+, we believe\b/i, label: "'we believe' brand filler" }
];

const replacements: Array<[RegExp, string]> = [
  [/\bin today'?s (?:fast-paced|rapidly changing|digital) world,?\s*/gi, ""],
  [/\bunlock (?:your|the) potential\b/gi, "build stronger skills"],
  [/\btake (?:your|the) ([^.!?\n]{1,60}) to the next level\b/gi, "improve $1"],
  [/\bharness the power of\b/gi, "use"],
  [/\bgame[- ]changer\b/gi, "useful option"],
  [/\brevolutioni[sz]e\b/gi, "improve"],
  [/\belevate your\b/gi, "improve your"],
  [/\btransform your\b/gi, "improve your"],
  [/\bdelve into\b/gi, "look at"],
  [/\bdive into\b/gi, "look at"],
  [/\bseamlessly\b/gi, "simply"],
  [/\bseamless\b/gi, "simple"],
  [/\bembark on (?:a|your|this) journey\b/gi, "start"],
  [/\byour journey starts here\b/gi, "start here"],
  [/\b(?:discover|explore) a world of\b/gi, "explore"],
  [/\bleverage\b/gi, "use"]
];

function cleanLine(value: string) {
  let line = value
    .replace(/[—–]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ");

  for (const [pattern, replacement] of replacements) line = line.replace(pattern, replacement);

  return line
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?])\s*-\s*([A-Z])/g, "$1 $2")
    .replace(/\bvery unique\b/gi, "distinct")
    .trim();
}

export function humanizeGeneratedText(value: string) {
  const source = String(value || "").replace(/\r\n?/g, "\n");
  return source
    .split("\n")
    .map(cleanLine)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function findAiStyleSignals(value: string) {
  const text = String(value || "");
  const matches = AI_STYLE_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
  if (/[—–]/.test(text)) matches.unshift("em/en dash punctuation");
  return [...new Set(matches)];
}
