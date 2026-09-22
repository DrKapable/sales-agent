import type { Offer } from "@/lib/types";
import { CURRENT_CONTENT_DESTINATIONS } from "@/lib/content-destinations";

export type OfferSeed = Omit<Offer, "id" | "updatedAt">;

const RESEARCH_PRICING_URL = "https://www.medmindslc.online/pricing";
const PAYMENT_DETAILS = "Submit payment to 0977259132, registered to Juma Phiri. Confirm payment with Dr. Mustafa Juma Phiri on 0977259132";
const PAYMENT_AFTER_QUOTE = "Once the amount is approved, submit payment to 0977259132, registered to Juma Phiri, and confirm it with Dr. Mustafa Juma Phiri on 0977259132";
const GENERAL_CONTACT = "Dr Kanyembo Ng'andwe on 0974634555";
const RESEARCH_PAYMENT = `Review research pricing at ${RESEARCH_PRICING_URL}. ${PAYMENT_DETAILS}. For other enquiries, contact ${GENERAL_CONTACT}.`;
const PREP_NMCZ = CURRENT_CONTENT_DESTINATIONS["prep-nmcz"].url;
const PREP_PRECLINICAL = CURRENT_CONTENT_DESTINATIONS["prep-preclinical"].url;
const PREP_MEDICAL = CURRENT_CONTENT_DESTINATIONS["prep-medical-students"].url;
const PREP_PG_IM = CURRENT_CONTENT_DESTINATIONS["prep-pg-internal-medicine"].url;
const RESEARCH_PORTAL = CURRENT_CONTENT_DESTINATIONS["research-portal"].url;
const ZATAFA_MEDSTATS = CURRENT_CONTENT_DESTINATIONS["zatafa-medstats"].url;
const MEMBERSHIP_ZAMBIA = "https://www.medmindslc.online/membership?market=zm";
const MEMBERSHIP_INTERNATIONAL = "https://www.medmindslc.online/membership/international";
const EXAM_PREP_PAGE = "https://www.medmindslc.online/exam-prep";
const NMCZ_PAGE = "https://www.medmindslc.online/nmcz";
const PLAB_MLA_PAGE = "https://www.medmindslc.online/plab-mla";
const INTERNATIONAL_QBANK = "https://www.medmindslc.online/international/qbank";
const CLINICALLY_EQUIPPED_GIVEAWAY = "https://www.medmindslc.online/giveaway/clinically-equipped";
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
      `Self-service pricing: ${RESEARCH_PRICING_URL}`,
      `Research Client Portal: ${RESEARCH_PORTAL}`
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

const medMindsPrepOffers: OfferSeed[] = [
  {
    slug: "pa-gym",
    name: "MedMinds Prep QBank, 30 Days",
    category: "MedMinds Prep",
    description: "Focused question-bank access with interactive revision tools for 30 days.",
    features: ["MedMinds Prep QBank", "Interactive Notes", "Weak-Spot Rx", "30 days of access", "Standard Zambia price: K100", `Medical-student campaign page: ${PREP_MEDICAL}`],
    priceZmw: 100,
    rushPriceZmw: 100,
    paymentInstructions: `Use the secure Zambia membership checkout: ${MEMBERSHIP_ZAMBIA}. Do not create a Research Portal payment request for this membership.`,
    active: true
  },
  {
    slug: "pa-gym-osce",
    name: "MedMinds Exam Prep, 30 Days",
    category: "MedMinds Prep",
    description: "Theory Past Papers and Clinical/OSCE preparation in one 30-day plan.",
    features: ["Theory Past Papers", "MCQ and written practice", "Interactive OSCE stations", "Exam circuits", "AI-supported practice", "Standard Zambia price: K150", `Exam Prep information: ${EXAM_PREP_PAGE}`],
    priceZmw: 150,
    rushPriceZmw: 150,
    paymentInstructions: `Use the secure Zambia membership checkout: ${MEMBERSHIP_ZAMBIA}. Do not create a Research Portal payment request for this membership.`,
    active: true
  },
  {
    slug: "pa-gym-combined",
    name: "MedMinds Complete, 30 Days",
    category: "MedMinds Prep",
    description: "QBank, Theory Past Papers and Clinical/OSCE preparation together for 30 days.",
    features: ["Everything in Exam Prep", "MedMinds Prep QBank", "Interactive Notes", "Weak-Spot Rx", "Standard Zambia price: K200"],
    priceZmw: 200,
    rushPriceZmw: 200,
    paymentInstructions: `Use the secure Zambia membership checkout: ${MEMBERSHIP_ZAMBIA}. Do not create a Research Portal payment request for this membership.`,
    active: true
  },
  {
    slug: "prep-complete-60-days",
    name: "MedMinds Complete, 60 Days",
    category: "MedMinds Prep",
    description: "Two months of QBank, Theory and Clinical/OSCE access in one membership.",
    features: ["60 days of Complete access", "Current price: K250", "Standard comparison: K400", "Current saving: K150", "Best-value standard offer"],
    priceZmw: 250,
    rushPriceZmw: 250,
    paymentInstructions: `Use the secure Zambia membership checkout: ${MEMBERSHIP_ZAMBIA}. Do not create a Research Portal payment request for this membership.`,
    active: true
  },
  {
    slug: "prep-complete-90-days",
    name: "MedMinds Complete, 90 Days",
    category: "MedMinds Prep",
    description: "Three months of Complete access in one payment.",
    features: ["90 days of Complete access", "Current price: K500", "Standard comparison: K600", "Current saving: K100"],
    priceZmw: 500,
    rushPriceZmw: 500,
    paymentInstructions: `Use the secure Zambia membership checkout: ${MEMBERSHIP_ZAMBIA}. A separate campaign-only K250/90-day offer must never be given without verified campaign eligibility.`,
    active: true
  },
  {
    slug: "pa-gym-preclinical",
    name: "MedMinds Prep Preclinical QBank",
    category: "MedMinds Prep",
    description: "Focused QBank practice for foundational and preclinical medical sciences.",
    features: ["Preclinical student access", "Foundational medical sciences", "2-day campaign trial where available", "QBank standard plan: K100 for 30 days", `Current preclinical landing page: ${PREP_PRECLINICAL}`],
    priceZmw: 100,
    rushPriceZmw: 100,
    paymentInstructions: `Start at ${PREP_PRECLINICAL} or use the secure Zambia membership checkout at ${MEMBERSHIP_ZAMBIA}.`,
    active: true
  },
  {
    slug: "pa-gym-nmcz",
    name: "MedMinds NMCZ Premium, 90 Days",
    category: "MedMinds Prep",
    description: "Independent preparation for the NMCZ competence examination.",
    features: ["NMCZ competence-exam preparation", "90 days of access", "Current offer: K200", "Displayed comparison: K300", "2-day free trial where available", `Current NMCZ page: ${NMCZ_PAGE}`],
    priceZmw: 200,
    rushPriceZmw: 200,
    paymentInstructions: `Use the current NMCZ page at ${NMCZ_PAGE} or the tracked campaign page at ${PREP_NMCZ}. Do not imply NMCZ affiliation or endorsement.`,
    active: true
  },
  {
    slug: "pa-gym-pg-internal-medicine",
    name: "MedMinds Exam Prep, STP/MMed Internal Medicine",
    category: "MedMinds Prep",
    description: "Postgraduate Internal Medicine Theory Past Papers, written practice and Clinical/OSCE preparation.",
    features: ["STP Internal Medicine", "MMed Internal Medicine", "Theory Past Papers", "Written practice", "Clinical/OSCE preparation", "Exam Prep standard plan: K150 for 30 days", "2-day campaign trial where available", `Current postgraduate Internal Medicine landing page: ${PREP_PG_IM}`],
    priceZmw: 150,
    rushPriceZmw: 150,
    paymentInstructions: `Start at ${PREP_PG_IM} or use the secure Zambia membership checkout at ${MEMBERSHIP_ZAMBIA}.`,
    active: true
  },
  {
    slug: "pa-gym-free-pass",
    name: "MedMinds Prep 2-Day Free Trial",
    category: "MedMinds Prep",
    description: "A programme-specific 2-day trial available through current campaign landing pages.",
    features: [
      "2-day campaign trial",
      `NMCZ: ${PREP_NMCZ}`,
      `Preclinical: ${PREP_PRECLINICAL}`,
      `Medical students: ${PREP_MEDICAL}`,
      `STP/MMed Internal Medicine: ${PREP_PG_IM}`
    ],
    priceZmw: 0,
    rushPriceZmw: 0,
    paymentInstructions: `Choose the programme-specific current landing page. Do not describe the separate 7-day giveaway as the standard trial.`,
    active: true
  },
  {
    slug: "prep-clinically-equipped-giveaway",
    name: "Clinically Equipped x MedMinds 7-Day Giveaway",
    category: "MedMinds Prep",
    description: "Campaign-specific 7-day free Clinical Question Bank access.",
    features: ["7 days free", "Clinical Question Bank", "Campaign eligibility required", `Giveaway page: ${CLINICALLY_EQUIPPED_GIVEAWAY}`],
    priceZmw: 0,
    rushPriceZmw: 0,
    paymentInstructions: `Use only for eligible giveaway users: ${CLINICALLY_EQUIPPED_GIVEAWAY}. Do not offer this campaign universally.`,
    active: true
  },
  {
    slug: "prep-international",
    name: "MedMinds Prep International Plans",
    category: "MedMinds Prep",
    description: "International recurring subscriptions in USD through secure Whop checkout.",
    features: [
      "QBank: USD 9.99 every 30 days",
      "Exam Prep: USD 14.99 every 30 days",
      "Complete: USD 19.99 every 30 days",
      "Complete 60 days: USD 34.99 every 60 days",
      "Complete 90 days: USD 44.99 every 90 days",
      "Subscriptions renew automatically until cancelled",
      `International checkout: ${MEMBERSHIP_INTERNATIONAL}`,
      `PLAB / MLA pathway: ${PLAB_MLA_PAGE}`,
      `International QBank: ${INTERNATIONAL_QBANK}`
    ],
    priceZmw: null,
    rushPriceZmw: null,
    paymentInstructions: `Use the secure international membership page at ${MEMBERSHIP_INTERNATIONAL} and Whop checkout. The USD prices in this offer's features are authoritative. Do not convert them into ZMW or create a Research Portal payment request.`,
    active: true
  }
];

const otherOffers: OfferSeed[] = [
  { slug: "powerpoint-presentation", name: "PowerPoint Presentation from a Dissertation or Proposal", category: "Academic Support", description: "Preparation of a PowerPoint presentation from a completed dissertation or research proposal.", features: ["Dissertation presentation", "Proposal presentation"], priceZmw: 650, rushPriceZmw: 650, paymentInstructions: `${PAYMENT_DETAILS}.`, active: true },
  { slug: "software-development", name: "Software Development", category: "Digital Services", description: "Custom software development scoped with a human assistant.", features: ["Custom quotation required"], priceZmw: null, rushPriceZmw: null, paymentInstructions: `Refer the client to ${GENERAL_CONTACT} for requirements and a quotation. ${PAYMENT_AFTER_QUOTE}.`, active: true },
  { slug: "web-development", name: "Web Development", category: "Digital Services", description: "Website design and development scoped with a human assistant.", features: ["Custom quotation required"], priceZmw: null, rushPriceZmw: null, paymentInstructions: `Refer the client to ${GENERAL_CONTACT} for requirements and a quotation. ${PAYMENT_AFTER_QUOTE}.`, active: true },
  { slug: "whatsapp-agency-automation", name: "WhatsApp Agency Automation", category: "Digital Services", description: "WhatsApp sales and agency automation scoped with a human assistant.", features: ["Custom quotation required"], priceZmw: null, rushPriceZmw: null, paymentInstructions: `Refer the client to ${GENERAL_CONTACT} for requirements and a quotation. ${PAYMENT_AFTER_QUOTE}.`, active: true },
  { slug: "zatafa-medstats", name: "ZaTafa MedStats", category: "Digital Services", description: "Guided medical and health research data analysis from dataset cleaning to tables, figures and an editable results narrative.", features: ["Data cleaning", "Analysis tables", "Figures and exports", `Current information page: ${ZATAFA_MEDSTATS}`], priceZmw: null, rushPriceZmw: null, paymentInstructions: `Open ${ZATAFA_MEDSTATS} or contact ${GENERAL_CONTACT} for assistance.`, active: true }
];

export const offerSeeds: OfferSeed[] = [
  ...researchPrices.map(researchOffer),
  ...medMindsPrepOffers,
  ...courseOffers,
  ...otherOffers
];
