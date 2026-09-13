export const creativeLayoutVariants = ["auto", "spotlight", "split", "cards", "editorial", "data-grid", "faq"] as const;
export type CreativeLayoutVariant = (typeof creativeLayoutVariants)[number];

export type CreativeLayoutInput = {
  contentType?: string | null;
  title?: string | null;
  objective?: string | null;
  body?: string | null;
};

function textFor(input: CreativeLayoutInput) {
  return [input.contentType, input.title, input.objective, input.body].filter(Boolean).join(" ").toLowerCase();
}

function stableIndex(value: string, length: number) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return length ? hash % length : 0;
}

function choose(text: string, variants: Exclude<CreativeLayoutVariant, "auto">[]) {
  return variants[stableIndex(text, variants.length)] || variants[0];
}

export function resolveCreativeLayout(input: CreativeLayoutInput, requested: CreativeLayoutVariant = "auto"): Exclude<CreativeLayoutVariant, "auto"> {
  if (requested !== "auto") return requested;
  const text = textFor(input);

  if (/\bfaq\b|frequently asked|question and answer|myth|notice/.test(text)) return "faq";
  if (/data analysis|statistics|statistical|zatafa|medstats|dashboard|software|digital|automation|technology/.test(text)) {
    return choose(text, ["data-grid", "split"]);
  }
  if (/medminds prep|qbank|question bank|exam|osce|revision|nmcz|preclinical|medical student|mbchb|stp|mmed/.test(text)) {
    return choose(text, ["split", "spotlight", "cards"]);
  }
  if (/research|proposal|dissertation|thesis|manuscript|academic writing|clinical learning|teaching|tip|education/.test(text)) {
    return choose(text, ["cards", "editorial", "spotlight"]);
  }
  if (/course|enrol|training|workshop/.test(text)) return choose(text, ["split", "cards", "spotlight"]);
  if (/announcement|launch|new|update|offer|promotion|promo/.test(text)) return "spotlight";
  if (/trust|community|story|behind the scenes/.test(text)) return "editorial";
  return choose(text, ["spotlight", "split", "editorial"]);
}

export function creativeLayoutLabel(value: CreativeLayoutVariant) {
  if (value === "spotlight") return "Spotlight";
  if (value === "split") return "Split feature";
  if (value === "cards") return "Benefit cards";
  if (value === "editorial") return "Editorial";
  if (value === "data-grid") return "Data / digital";
  if (value === "faq") return "FAQ";
  return "Auto — match content";
}
