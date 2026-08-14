import type { Offer } from "@/lib/types";

export type OfferSeed = Omit<Offer, "id" | "updatedAt">;

const RESEARCH_PRICING_URL = "https://www.medmindslc.online/pricing";
const PAYMENT_DETAILS = "Submit payment to 0977259132, registered to Juma Phiri. Confirm payment with Dr. Mustafa Juma Phiri on 0977259132";
const PAYMENT_AFTER_QUOTE = "Once the amount is approved, submit payment to 0977259132, registered to Juma Phiri, and confirm it with Dr. Mustafa Juma Phiri on 0977259132";
const GENERAL_CONTACT = "Dr Kanyembo Ng'andwe on 0974634555";
const RESEARCH_PAYMENT = `Review research pricing at ${RESEARCH_PRICING_URL}. ${PAYMENT_DETAILS}. For other enquiries, contact ${GENERAL_CONTACT}.`;
const PA_GYM_ACCOUNT = "https://medmindslc.site/pa-gym-start.html?ref=jumamustafap";
const AI_PROPOSAL_COURSE_PAYMENT = "AI-Assisted Research Proposal Writing course payment: Airtel Money 0977259132 (Juma Phiri) or MTN Money 0969152364 (Musonda Mupeta). After payment, send proof of payment and your email address for account activation. Create your account at https://medmindslc.online/user-account/.";

type ResearchPrice = {
  slug: string;
  name: string;
  group: string;
  min: number;
  max: number;
  adjustments?: boolean;
};

const researchPrices: ResearchPrice[] = [
  { slug: "proposal-diploma", name: "Research Proposal, Diploma", group: "Research and Writing", min: 700, max: 900, adjustments: true },
  { slug: "proposal-bachelors", name: "Research Proposal, Bachelor's", group: "Research and Writing", min: 1200, max: 1600, adjustments: true },
  { slug: "proposal-masters", name: "Research Proposal, Master's", group: "Research and Writing", min: 2000, max: 3000, adjustments: true },
  { slug: "proposal-phd", name: "Research Proposal, PhD", group: "Research and Writing", min: 3700, max: 4700, adjustments: true },
  { slug: "dissertation-diploma", name: "Dissertation or Thesis, Diploma", group: "Research and Writing", min: 1000, max: 1200, adjustments: true },
  { slug: "dissertation-bachelors", name: "Dissertation or Thesis, Bachelor's", group: "Research and Writing", min: 1700, max: 2500, adjustments: true },
  { slug: "dissertation-masters", name: "Dissertation or Thesis, Master's", group: "Research and Writing", min: 2700, max: 3500, adjustments: true },
  { slug: "dissertation-phd", name: "Dissertation or Thesis, PhD", group: "Research and Writing", min: 4200, max: 5400, adjustments: true },
  { slug: "manuscript-writing", name: "Manuscript Writing", group: "Research and Writing", min: 3700, max: 7700, adjustments: true },
  { slug: "research-support", name: "Research Topic Development", group: "Research and Writing", min: 300, max: 300, adjustments: true },
  { slug: "data-analysis", name: "Quantitative Analysis", group: "Data Analysis", min: 1700, max: 1700 },
  { slug: "qualitative-analysis", name: "Qualitative Analysis", group: "Data Analysis", min: 2000, max: 2000 },
  { slug: "mixed-methods-analysis", name: "Mixed-Methods Analysis", group: "Data Analysis", min: 3200, max: 3200 },
  { slug: "data-collection-tool", name: "Data Collection Tool", group: "Data Analysis", min: 500, max: 500, adjustments: true },
  { slug: "data-collection", name: "Data Collection", group: "Data Analysis", min: 1200, max: 1700, adjustments: true },
  { slug: "proofreading", name: "Proofreading", group: "Editing and QA", min: 700, max: 700 },
  { slug: "academic-editing-diploma", name: "Academic Editing, Diploma", group: "Editing and QA", min: 700, max: 900 },
  { slug: "academic-editing-bachelors", name: "Academic Editing, Bachelor's", group: "Editing and QA", min: 800, max: 1100 },
  { slug: "academic-editing-masters", name: "Academic Editing, Master's", group: "Editing and QA", min: 1000, max: 1400 },
  { slug: "academic-editing-phd", name: "Academic Editing, PhD", group: "Editing and QA", min: 1200, max: 1700 },
  { slug: "research-paper-editing", name: "Research Paper Editing", group: "Editing and QA", min: 700, max: 2200 },
  { slug: "supervisor-corrections", name: "Supervisor Corrections", group: "Editing and QA", min: 700, max: 1200 },
  { slug: "plagiarism-check", name: "Plagiarism Check Report", group: "Plagiarism and AI", min: 350, max: 350 },
  { slug: "ai-detection-check", name: "AI Detection Report", group: "Plagiarism and AI", min: 350, max: 350 },
  { slug: "reduce-plagiarism", name: "Reduce Plagiarism", group: "Plagiarism and AI", min: 1000, max: 1700 },
  { slug: "reduce-ai-detection", name: "Reduce AI Detection", group: "Plagiarism and AI", min: 1000, max: 1700 },
  { slug: "tutorials", name: "Learn Proposal Writing", group: "Training", min: 1700, max: 3200, adjustments: true },
  { slug: "learn-data-analysis", name: "Learn Data Analysis", group: "Training", min: 2700, max: 3700, adjustments: true }
];

function researchOffer(price: ResearchPrice): OfferSeed {
  const standard = (price.min + price.max) / 2;
  const ranged = price.min !== price.max;
  return {
    slug: price.slug,
    name: price.name,
    category: price.group,
    description: ranged
      ? `Standard price is the midpoint of the approved K${price.min} to K${price.max} range for a 14-day deadline. The approved upper limit applies when the deadline is under 14 days.`
      : "Approved fixed-price research service.",
    features: [
      `Source range: K${price.min} to K${price.max}`,
      "International clients: add 25% after other adjustments",
      ...(price.adjustments ? ["Non-medical field: add K200", "UNZA, UNILUS or Cavendish: add K200"] : []),
      `Self-service pricing: ${RESEARCH_PRICING_URL}`
    ],
    priceZmw: standard,
    rushPriceZmw: price.max,
    paymentInstructions: RESEARCH_PAYMENT,
    active: true
  };
}

const courseOffers: OfferSeed[] = [
  {
    slug: "course-ai-research-writing",
    name: "AI-Assisted Research Proposal Writing",
    category: "Courses",
    description: "A 2-hour, 10-module, fully self-paced online course that guides learners from defining a research problem through literature searching, ethical AI use, reference management, sample-size calculation, proposal drafting and professional Word formatting.",
    features: [
      "2 hours total across 10 short self-paced modules",
      "Lifetime access with immediate access after enrolment",
      "Research problem and topic definition",
      "Academic literature searching with Google Scholar, PubMed and AJOL",
      "Zotero reference management and automatic citations/bibliographies",
      "Ethical use of ChatGPT/LLMs for academic research",
      "Research Rabbit and KoboToolbox",
      "Sample-size calculation with OpenEpi",
      "Evidence-based proposal drafting and Microsoft Word formatting",
      "Course videos stream on the platform and are not downloadable"
    ],
    priceZmw: 350,
    rushPriceZmw: 350,
    paymentInstructions: AI_PROPOSAL_COURSE_PAYMENT,
    active: true
  },
  { slug: "course-digital-surveys", name: "Create Digital Surveys with ChatGPT and KoboToolbox", category: "Courses", description: "A beginner course on generating survey questions, building digital forms and managing responses.", features: ["Beginner level", "Self-paced online learning"], priceZmw: 0, rushPriceZmw: 0, paymentInstructions: `Contact ${GENERAL_CONTACT} for the current enrolment link.`, active: true },
  { slug: "course-ecg", name: "Master ECG Interpretation", category: "Courses", description: "Step-by-step ECG interpretation for medical students and junior doctors preparing for clinical examinations.", features: ["Intermediate level", "Certificate included", "Clinical and OSCE focused"], priceZmw: 1500, rushPriceZmw: 1500, paymentInstructions: `${PAYMENT_DETAILS}.`, active: true },
  { slug: "course-chest-xray", name: "Mastering Chest X-Ray Interpretation for MBChB OSCEs", category: "Courses", description: "A structured, examination-focused approach to common chest radiograph findings.", features: ["Intermediate level", "Certificate included", "OSCE focused"], priceZmw: 1200, rushPriceZmw: 1200, paymentInstructions: `${PAYMENT_DETAILS}.`, active: true },
  { slug: "course-kobotoolbox", name: "Data Collection Using KoboToolbox", category: "Courses", description: "Practical form design, deployment, mobile data collection, management and export for analysis.", features: ["Beginner level", "Self-paced online learning"], priceZmw: 800, rushPriceZmw: 800, paymentInstructions: `${PAYMENT_DETAILS}.`, active: true },
  { slug: "course-osce-revision", name: "OSCE High-Yield Revision Session", category: "Courses", description: "High-yield station practice, clinical examination, history taking and communication skills.", features: ["Advanced level", "Certificate included", "Exam preparation"], priceZmw: 2000, rushPriceZmw: 2000, paymentInstructions: `${PAYMENT_DETAILS}.`, active: true }
];

const paGymOffers: OfferSeed[] = [
  { slug: "pa-gym", name: "Pa Gym Theory", category: "Pa Gym", description: "Monthly undergraduate medical theory practice with timed question sets and worked explanations.", features: ["Internal Medicine", "Paediatrics", "Obstetrics and Gynaecology", "Surgery", "Train by system or random circuit"], priceZmw: 100, rushPriceZmw: 100, paymentInstructions: `Use https://medmindslc.site/mayadi.html. ${PAYMENT_DETAILS}. Create an account or claim a 24-hour free pass at ${PA_GYM_ACCOUNT}.`, active: true },
  { slug: "pa-gym-osce", name: "Pa Gym OSCE", category: "Pa Gym", description: "Monthly undergraduate medical OSCE preparation and clinical practice.", features: ["Undergraduate medical students", "OSCE preparation", "Monthly access"], priceZmw: 100, rushPriceZmw: 100, paymentInstructions: `Use https://medmindslc.site/mayadi.html. ${PAYMENT_DETAILS}. Create an account or claim a 24-hour free pass at ${PA_GYM_ACCOUNT}.`, active: true },
  { slug: "pa-gym-combined", name: "Pa Gym Theory and OSCE", category: "Pa Gym", description: "Monthly undergraduate access to both Pa Gym theory and OSCE preparation.", features: ["Theory access: K100 per month", "OSCE access: K100 per month", "Total monthly price: K200"], priceZmw: 200, rushPriceZmw: 200, paymentInstructions: `Use https://medmindslc.site/mayadi.html. ${PAYMENT_DETAILS}. Create an account or claim a 24-hour free pass at ${PA_GYM_ACCOUNT}.`, active: true },
  { slug: "pa-gym-preclinical", name: "Pa Gym Preclinical", category: "Pa Gym", description: "Pa Gym access for preclinical students. The client should use the dedicated page for the current package and payment amount.", features: ["Preclinical student access", `Account creation and 24-hour free pass: ${PA_GYM_ACCOUNT}`], priceZmw: null, rushPriceZmw: null, paymentInstructions: `View the current package at https://medmindslc.site/preclinical.html. ${PAYMENT_DETAILS}.`, active: true },
  { slug: "pa-gym-nmcz", name: "Pa Gym NMCZ Nursing Preparation", category: "Pa Gym", description: "Pa Gym examination preparation for nurses preparing for NMCZ.", features: ["NMCZ preparation", `Account creation and 24-hour free pass: ${PA_GYM_ACCOUNT}`], priceZmw: null, rushPriceZmw: null, paymentInstructions: `View the current package at https://medmindslc.site/nmcz.html. ${PAYMENT_DETAILS}.`, active: true },
  { slug: "pa-gym-free-pass", name: "Pa Gym 24-Hour Free Pass", category: "Pa Gym", description: "A 24-hour trial for clients who want to try Pa Gym. The same page is used by paid clients who still need an account.", features: ["24-hour trial", "Account creation for already-paid clients"], priceZmw: 0, rushPriceZmw: 0, paymentInstructions: `Create the account at ${PA_GYM_ACCOUNT}.`, active: true }
];

const otherOffers: OfferSeed[] = [
  { slug: "powerpoint-presentation", name: "PowerPoint Presentation from a Dissertation or Proposal", category: "Academic Support", description: "Preparation of a PowerPoint presentation from a completed dissertation or research proposal.", features: ["Dissertation presentation", "Proposal presentation"], priceZmw: 650, rushPriceZmw: 650, paymentInstructions: `${PAYMENT_DETAILS}.`, active: true },
  { slug: "software-development", name: "Software Development", category: "Digital Services", description: "Custom software development scoped with a human assistant.", features: ["Custom quotation required"], priceZmw: null, rushPriceZmw: null, paymentInstructions: `Refer the client to ${GENERAL_CONTACT} for requirements and a quotation. ${PAYMENT_AFTER_QUOTE}.`, active: true },
  { slug: "web-development", name: "Web Development", category: "Digital Services", description: "Website design and development scoped with a human assistant.", features: ["Custom quotation required"], priceZmw: null, rushPriceZmw: null, paymentInstructions: `Refer the client to ${GENERAL_CONTACT} for requirements and a quotation. ${PAYMENT_AFTER_QUOTE}.`, active: true },
  { slug: "whatsapp-agency-automation", name: "WhatsApp Agency Automation", category: "Digital Services", description: "WhatsApp sales and agency automation scoped with a human assistant.", features: ["Custom quotation required"], priceZmw: null, rushPriceZmw: null, paymentInstructions: `Refer the client to ${GENERAL_CONTACT} for requirements and a quotation. ${PAYMENT_AFTER_QUOTE}.`, active: true },
  { slug: "zatafa-medstats", name: "ZaTafa MedStats", category: "Digital Services", description: "Guided medical and health research data analysis from dataset cleaning to tables, figures and an editable results narrative.", features: ["Data cleaning", "Analysis tables", "Figures and exports", "Open at https://zatafa.medmindslc.online/"], priceZmw: null, rushPriceZmw: null, paymentInstructions: `Open https://zatafa.medmindslc.online/ or contact ${GENERAL_CONTACT} for assistance.`, active: true }
];

export const offerSeeds: OfferSeed[] = [
  ...researchPrices.map(researchOffer),
  ...paGymOffers,
  ...courseOffers,
  ...otherOffers
];
