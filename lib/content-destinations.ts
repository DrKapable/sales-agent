export type ContentDestinationKey =
  | "prep-nmcz"
  | "prep-preclinical"
  | "prep-medical-students"
  | "prep-pg-internal-medicine"
  | "research-pricing"
  | "research-portal"
  | "zatafa-medstats"
  | "digital-contact"
  | "main-site";

export type ContentDestination = {
  key: ContentDestinationKey;
  label: string;
  url: string;
  cta: string;
};

const REF = "jumamustafap";

export const CURRENT_CONTENT_DESTINATIONS: Record<ContentDestinationKey, ContentDestination> = {
  "prep-nmcz": {
    key: "prep-nmcz",
    label: "MedMinds NMCZ practice",
    url: `https://www.medmindslc.online/affiliate/nmcz?ref=${REF}`,
    cta: `Preparing for the NMCZ competence examination? Try MedMinds NMCZ practice for 2 days free, then choose the plan that suits you: https://www.medmindslc.online/affiliate/nmcz?ref=${REF}`
  },
  "prep-preclinical": {
    key: "prep-preclinical",
    label: "MedMinds Preclinical practice",
    url: `https://www.medmindslc.online/affiliate/preclinical?ref=${REF}`,
    cta: `Strengthen your foundational medical sciences with focused QBank practice and a 2-day free trial: https://www.medmindslc.online/affiliate/preclinical?ref=${REF}`
  },
  "prep-medical-students": {
    key: "prep-medical-students",
    label: "MedMinds medical-student exam preparation",
    url: `https://www.medmindslc.online/affiliate/medical-students?ref=${REF}`,
    cta: `Prepare with MedMinds QBank, Past Papers Theory and OSCE Clinical Skills. Start with a 2-day free trial: https://www.medmindslc.online/affiliate/medical-students?ref=${REF}`
  },
  "prep-pg-internal-medicine": {
    key: "prep-pg-internal-medicine",
    label: "MedMinds postgraduate Internal Medicine preparation",
    url: `https://www.medmindslc.online/affiliate/pg-internal-medicine?ref=${REF}`,
    cta: `STP/MMed Internal Medicine revision with past papers, written practice and OSCE preparation. Start with a 2-day free trial: https://www.medmindslc.online/affiliate/pg-internal-medicine?ref=${REF}`
  },
  "research-pricing": {
    key: "research-pricing",
    label: "MedMinds research pricing",
    url: "https://www.medmindslc.online/pricing",
    cta: "View the current MedMinds research-service pricing: https://www.medmindslc.online/pricing"
  },
  "research-portal": {
    key: "research-portal",
    label: "MedMinds Research Client Portal",
    url: "https://www.medmindslc.online/research-portal",
    cta: "Submit or track your research request through the MedMinds Research Client Portal: https://www.medmindslc.online/research-portal"
  },
  "zatafa-medstats": {
    key: "zatafa-medstats",
    label: "ZaTafa MedStats",
    url: "https://www.medmindslc.online/zatafa-medstats",
    cta: "Explore the structured ZaTafa MedStats workflow for medical and health research data analysis: https://www.medmindslc.online/zatafa-medstats"
  },
  "digital-contact": {
    key: "digital-contact",
    label: "MedMinds digital services contact",
    url: "https://www.medmindslc.online/contact",
    cta: "Discuss your software, web or automation requirements with MedMinds: https://www.medmindslc.online/contact"
  },
  "main-site": {
    key: "main-site",
    label: "MedMinds Learning Centre",
    url: "https://www.medmindslc.online/pages",
    cta: "Explore MedMinds Learning Centre: https://www.medmindslc.online/pages"
  }
};

const URL_PATTERN = /https?:\/\/[^\s<>()]+/gi;
const LEGACY_PREP_HOST = /https?:\/\/(?:www\.)?medmindslc\.site\/[\w\-./?=&%#]*/gi;
const LEGACY_PREP_PATH = /https?:\/\/(?:www\.)?medmindslc\.online\/(?:nmcz|preclinical|pa-gym(?:-[\w-]+)?|mayadi)(?:[/?#][^\s<>()]*)?/gi;

function contextText(input: {
  contentType?: string | null;
  objective?: string | null;
  audience?: string | null;
  notes?: string | null;
  body?: string | null;
  title?: string | null;
}) {
  return [input.contentType, input.objective, input.audience, input.notes, input.body, input.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function selectContentDestination(input: {
  contentType?: string | null;
  objective?: string | null;
  audience?: string | null;
  notes?: string | null;
  body?: string | null;
  title?: string | null;
}): ContentDestination | null {
  const text = contextText(input);
  if (!text.trim()) return null;

  if (/\bnmcz\b|nursing council|competence exam|competency exam/.test(text)) {
    return CURRENT_CONTENT_DESTINATIONS["prep-nmcz"];
  }
  if (/preclinical|pre-clinical|foundational medical sciences|basic medical sciences|anatomy|physiology|biochem(?:istry)?/.test(text)) {
    return CURRENT_CONTENT_DESTINATIONS["prep-preclinical"];
  }
  if (/\bstp\b|\bmmed\b|postgraduate internal medicine|post-graduate internal medicine|pg internal medicine|imed registrar|internal medicine registrar/.test(text)) {
    return CURRENT_CONTENT_DESTINATIONS["prep-pg-internal-medicine"];
  }
  if (/medminds prep|qbank|question bank|past papers theory|osce clinical skills|medical student|mbchb|undergraduate medicine|clinical exam(?:ination)?|osce practice|exam preparation/.test(text)) {
    return CURRENT_CONTENT_DESTINATIONS["prep-medical-students"];
  }
  if (/zatafa|medstats|publication-ready tables|dataset cleaning|analysis workspace/.test(text)) {
    return CURRENT_CONTENT_DESTINATIONS["zatafa-medstats"];
  }
  if (/research pricing|price(?:s| list)?|how much|cost of research/.test(text) && /research|proposal|dissertation|thesis|analysis|manuscript/.test(text)) {
    return CURRENT_CONTENT_DESTINATIONS["research-pricing"];
  }
  if (/research service promotion|research support|proposal|dissertation|thesis|manuscript|data collection|academic writing support|supervisor corrections|proofreading/.test(text)) {
    return CURRENT_CONTENT_DESTINATIONS["research-portal"];
  }
  if (/software development|web development|website|whatsapp automation|digital service|digital health/.test(text)) {
    return CURRENT_CONTENT_DESTINATIONS["digital-contact"];
  }
  return null;
}

function stripTrailingPunctuation(value: string) {
  return value.replace(/[.,;:!?]+$/, "");
}

export function removeLegacyMedMindsUrls(value: string) {
  return value
    .replace(LEGACY_PREP_HOST, "")
    .replace(LEGACY_PREP_PATH, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function ensureDestinationInCaption(value: string, destination: ContentDestination | null) {
  let caption = removeLegacyMedMindsUrls(value);
  if (!destination) return caption;

  const urls = caption.match(URL_PATTERN) || [];
  const hasCurrentDestination = urls.some((url) => stripTrailingPunctuation(url) === destination.url);
  if (hasCurrentDestination) return caption;

  // Do not silently replace an unrelated current MedMinds link (for example a research portal link)
  // with a Prep link. Legacy Prep links are removed above; the correct current destination is then appended.
  return `${caption}\n\n${destination.cta}`.trim();
}

export function currentDestinationPromptBlock() {
  const rows = Object.values(CURRENT_CONTENT_DESTINATIONS)
    .filter((item) => item.key !== "main-site")
    .map((item) => `- ${item.label}: ${item.url}`)
    .join("\n");
  return `CURRENT PUBLIC DESTINATIONS (authoritative; do not invent or substitute URLs)\n${rows}`;
}
