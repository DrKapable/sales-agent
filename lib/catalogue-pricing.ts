type CatalogueOffer = {
  slug: string;
  name: string;
  category?: string | null;
  description?: string | null;
  priceZmw: number | null;
  rushPriceZmw: number | null;
};

export type CataloguePriceResolution =
  | { status: "matched"; offer: CatalogueOffer; amountZmw: number; priceType: "standard" | "rush"; reason: string }
  | { status: "custom"; offer: CatalogueOffer; reason: string }
  | { status: "ambiguous"; candidates: CatalogueOffer[]; reason: string }
  | { status: "not_found"; reason: string };

function normalize(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function academicLevel(value: string) {
  const text = normalize(value);
  if (/\b(phd|doctorate|doctoral)\b/.test(text)) return "phd";
  if (/\b(master|masters|msc|mph|ma|mmed)\b/.test(text)) return "masters";
  if (/\b(bachelor|bachelors|degree|undergraduate|bsc|ba|mbchb)\b/.test(text)) return "bachelors";
  if (/\bdiploma\b/.test(text)) return "diploma";
  return null;
}

function aliasSlug(service: string, programme?: string | null) {
  const text = normalize(`${service} ${programme || ""}`);
  const level = academicLevel(text);

  if (/\bproposal\b/.test(text) && level) return `proposal-${level}`;
  if (/\b(dissertation|thesis)\b/.test(text) && level) return `dissertation-${level}`;
  if (/\bacademic editing\b/.test(text) && level) return `academic-editing-${level}`;
  if (/\b(mixed methods|mixed method)\b/.test(text) && /\banalys/.test(text)) return "mixed-methods-analysis";
  if (/\bqualitative\b/.test(text) && /\banalys/.test(text)) return "qualitative-analysis";
  if (/\b(quantitative|data analysis|statistical analysis|statistics)\b/.test(text) && !/\bqualitative\b/.test(text)) return "data-analysis";
  if (/\bdata collection tool|questionnaire|survey tool\b/.test(text)) return "data-collection-tool";
  if (/\bdata collection\b/.test(text)) return "data-collection";
  if (/\b(topic development|research topic)\b/.test(text)) return "research-support";
  if (/\bproofread/.test(text)) return "proofreading";
  if (/\bresearch paper editing\b/.test(text)) return "research-paper-editing";
  if (/\bsupervisor corrections?\b/.test(text)) return "supervisor-corrections";
  if (/\bplagiarism (check|report)\b/.test(text)) return "plagiarism-check";
  if (/\bai (detection|check|report)\b/.test(text)) return "ai-detection-check";
  if (/\breduce plagiarism\b/.test(text)) return "reduce-plagiarism";
  if (/\breduce ai detection\b/.test(text)) return "reduce-ai-detection";
  if (/\bmanuscript\b/.test(text)) return "manuscript-writing";
  if (/\blearn proposal|proposal writing course|proposal writing training\b/.test(text)) return "tutorials";
  if (/\blearn data analysis|data analysis training|data analysis course\b/.test(text)) return "learn-data-analysis";
  if (/\bai assisted research proposal writing\b/.test(text)) return "course-ai-research-writing";
  if (/\bdigital surveys?\b|\bchatgpt and kobotoolbox\b/.test(text)) return "course-digital-surveys";
  if (/\becg\b/.test(text)) return "course-ecg";
  if (/\b(chest x ray|chest xray)\b/.test(text)) return "course-chest-xray";
  if (/\bkobotoolbox\b/.test(text) && /\b(course|training|learn|data collection)\b/.test(text)) return "course-kobotoolbox";
  if (/\bosce high yield|osce revision session\b/.test(text)) return "course-osce-revision";
  if (/\bpa gym\b/.test(text) && /\b(theory.*osce|osce.*theory|combined|both)\b/.test(text)) return "pa-gym-combined";
  if (/\bpa gym\b/.test(text) && /\bosce\b/.test(text)) return "pa-gym-osce";
  if (/\bpa gym\b/.test(text) && /\bpreclinical\b/.test(text)) return "pa-gym-preclinical";
  if (/\bpa gym\b/.test(text) && /\bnmcz|nursing\b/.test(text)) return "pa-gym-nmcz";
  if (/\bpa gym\b/.test(text)) return "pa-gym";
  if (/\bpowerpoint|presentation from (?:a )?(?:dissertation|proposal)\b/.test(text)) return "powerpoint-presentation";
  if (/\bwhatsapp\b/.test(text) && /\bautomation|agency\b/.test(text)) return "whatsapp-agency-automation";
  if (/\bweb(?:site)? development|website design\b/.test(text)) return "web-development";
  if (/\bsoftware development|custom software\b/.test(text)) return "software-development";
  if (/\bzatafa|medstats\b/.test(text)) return "zatafa-medstats";
  return null;
}

function deadlineIsRush(deadline?: string | null, now = new Date()) {
  const text = normalize(deadline);
  if (!text) return false;
  if (/\b(asap|urgent|rush|tomorrow|this week)\b/.test(text)) return true;
  const relative = text.match(/\b(\d+)\s*(day|days|week|weeks)\b/);
  if (relative) {
    const amount = Number(relative[1]);
    const days = /week/.test(relative[2]) ? amount * 7 : amount;
    return days < 14;
  }
  const parsed = new Date(String(deadline));
  if (!Number.isFinite(parsed.getTime())) return false;
  const days = (parsed.getTime() - now.getTime()) / 86400000;
  return days < 14;
}

function tokenScore(query: string, offer: CatalogueOffer) {
  const queryTokens = new Set(normalize(query).split(" ").filter((token) => token.length > 2));
  const offerTokens = new Set(normalize(`${offer.name} ${offer.slug} ${offer.category || ""}`).split(" ").filter((token) => token.length > 2));
  if (!queryTokens.size || !offerTokens.size) return 0;
  let overlap = 0;
  queryTokens.forEach((token) => { if (offerTokens.has(token)) overlap += 1; });
  return overlap / Math.max(1, queryTokens.size);
}

export function resolveCataloguePrice(
  offers: CatalogueOffer[],
  input: { service: string; programme?: string | null; deadline?: string | null; forceRush?: boolean; now?: Date }
): CataloguePriceResolution {
  const active = offers.filter((offer) => offer && offer.slug && offer.name);
  const requested = String(input.service || "").trim();
  if (!requested) return { status: "not_found", reason: "The client’s service has not been established, so a catalogue price cannot be selected safely." };

  const alias = aliasSlug(requested, input.programme);
  let matches: CatalogueOffer[] = [];
  if (alias) matches = active.filter((offer) => offer.slug === alias);

  if (!matches.length) {
    const normalized = normalize(requested);
    matches = active.filter((offer) => normalize(offer.name) === normalized || normalize(offer.slug) === normalized);
  }

  if (!matches.length) {
    const ranked = active
      .map((offer) => ({ offer, score: tokenScore(`${requested} ${input.programme || ""}`, offer) }))
      .filter((row) => row.score >= 0.5)
      .sort((a, b) => b.score - a.score);
    if (ranked.length) {
      const best = ranked[0].score;
      matches = ranked.filter((row) => row.score === best).map((row) => row.offer);
    }
  }

  if (!matches.length) return { status: "not_found", reason: `No active service in the MedMinds catalogue reliably matches “${requested}”.` };
  if (matches.length > 1) return { status: "ambiguous", candidates: matches.slice(0, 5), reason: `More than one catalogue service could match “${requested}”.` };

  const offer = matches[0];
  if (offer.priceZmw == null) return { status: "custom", offer, reason: `${offer.name} is marked as a custom-quotation service in the catalogue and has no fixed amount.` };

  const rush = Boolean(input.forceRush) || deadlineIsRush(input.deadline, input.now || new Date());
  const amount = rush && offer.rushPriceZmw != null ? offer.rushPriceZmw : offer.priceZmw;
  return {
    status: "matched",
    offer,
    amountZmw: Number(amount),
    priceType: rush && offer.rushPriceZmw != null ? "rush" : "standard",
    reason: rush && offer.rushPriceZmw != null
      ? `Catalogue rush price selected because the known deadline is under 14 days or the administrator explicitly requested rush pricing.`
      : `Catalogue standard price selected.`
  };
}
