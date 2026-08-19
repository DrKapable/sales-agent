export const SERVICE_CATEGORY_ORDER = [
  "Research Support Services",
  "Online Courses",
  "Pa Gym Services",
  "Software, AI & Automation",
  "Others"
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORY_ORDER)[number];

type OfferLike = {
  slug?: string | null;
  name?: string | null;
  category?: string | null;
};

type LeadLike = {
  serviceInterest?: string | null;
  packageName?: string | null;
  serviceCategory?: string | null;
  status?: string | null;
};

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validCategory(value: unknown): ServiceCategory | null {
  const text = String(value || "");
  return SERVICE_CATEGORY_ORDER.includes(text as ServiceCategory) ? (text as ServiceCategory) : null;
}

function categoryFromCatalogueMetadata(offer: OfferLike): ServiceCategory | null {
  const alreadyHarmonized = validCategory(offer.category);
  if (alreadyHarmonized) return alreadyHarmonized;

  const slug = normalize(offer.slug);
  const category = normalize(offer.category);

  if (slug.startsWith("pa gym") || category === "pa gym") return "Pa Gym Services";
  if (slug.startsWith("course ") || ["courses", "training"].includes(category)) return "Online Courses";

  if (
    slug === "software development" ||
    slug === "web development" ||
    slug === "whatsapp agency automation" ||
    slug === "zatafa medstats" ||
    category === "digital services"
  ) return "Software, AI & Automation";

  if (["research and writing", "data analysis", "editing and qa", "plagiarism and ai"].includes(category)) {
    return "Research Support Services";
  }

  if (category === "academic support") return "Others";
  return null;
}

function categoryFromFreeText(value: string): ServiceCategory {
  const text = normalize(value);
  if (!text) return "Others";

  if (/\bpa gym\b|\bnmcz\b.*\b(prep|preparation|exam)\b/.test(text)) return "Pa Gym Services";

  if (
    /\b(course|courses|training|tutorial|tutorials|learn|learning programme|self paced|master ecg interpretation|ecg interpretation|mastering chest x ray|chest x ray interpretation|digital surveys|kobotoolbox course|osce high yield revision|ai assisted research proposal writing)\b/.test(text)
  ) return "Online Courses";

  if (
    /\b(research support|research services|research assistance|research writing|academic writing|proposal|dissertation|thesis|research topic|topic development|manuscript|methodology|literature review|data analysis|quantitative|qualitative|mixed methods|data collection|questionnaire|survey tool|proofread|proofreading|academic editing|research paper editing|supervisor corrections?|plagiarism|ai detection|statistical analysis|statistics)\b/.test(text)
  ) return "Research Support Services";

  if (
    /\b(software|website|web development|web design|automation|ai agent|artificial intelligence|chatbot|whatsapp automation|digital platform|system development|lms|learning management system|workforce manager|exam management|digital logbook|zatafa|medstats|application development|app development|ai solution|ai solutions)\b/.test(text)
  ) return "Software, AI & Automation";

  return "Others";
}

export function harmonizeServiceCategory(service: unknown, offers: OfferLike[] = []): ServiceCategory {
  const requested = normalize(service);
  if (!requested) return "Others";

  const exact = offers.find((offer) => {
    const name = normalize(offer.name);
    const slug = normalize(offer.slug);
    return requested === name || requested === slug;
  });
  if (exact) return categoryFromCatalogueMetadata(exact) || categoryFromFreeText(String(exact.name || service));

  const partial = offers.find((offer) => {
    const name = normalize(offer.name);
    return name.length >= 6 && (requested.includes(name) || name.includes(requested));
  });
  if (partial) return categoryFromCatalogueMetadata(partial) || categoryFromFreeText(String(partial.name || service));

  return categoryFromFreeText(String(service || ""));
}

export function serviceCategoryForLead(lead: LeadLike, offers: OfferLike[] = []): ServiceCategory {
  return validCategory(lead.serviceCategory) || harmonizeServiceCategory(lead.serviceInterest || lead.packageName || "", offers);
}

export function summarizeServiceCategories(leads: LeadLike[], offers: OfferLike[] = []) {
  const counts = new Map<ServiceCategory, { leads: number; converted: number }>(
    SERVICE_CATEGORY_ORDER.map((category) => [category, { leads: 0, converted: 0 }])
  );

  for (const lead of leads) {
    const category = serviceCategoryForLead(lead, offers);
    const row = counts.get(category)!;
    row.leads += 1;
    if (String(lead.status || "") === "CONVERTED") row.converted += 1;
  }

  return SERVICE_CATEGORY_ORDER.map((service) => {
    const values = counts.get(service)!;
    return {
      service,
      category: service,
      leads: values.leads,
      converted: values.converted,
      conversionRate: values.leads ? Math.round((values.converted / values.leads) * 100) : 0
    };
  });
}

export function managementCategoryForOffer(offer: OfferLike): ServiceCategory {
  return categoryFromCatalogueMetadata(offer) || categoryFromFreeText(String(offer.name || offer.slug || ""));
}
