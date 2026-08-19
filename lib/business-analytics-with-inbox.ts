import { buildBusinessAnalytics, type AnalyticsGap, type AnalyticsSeverity } from "@/lib/business-analytics";
import { buildInboxConversationIntelligence, type InboxLeadSignals } from "@/lib/inbox-conversation-intelligence";
import { SERVICE_CATEGORY_ORDER, harmonizeServiceCategory, precisePercentage, serviceCategoryForLead, summarizeServiceCategories } from "@/lib/service-categories";

type SnapshotLike = Parameters<typeof buildBusinessAnalytics>[0] & { leads?: any[]; offers?: any[] };

type SignalKey = keyof InboxLeadSignals["signals"];

function activeLead(lead: any) {
  return !["CONVERTED", "LOST LEAD"].includes(String(lead?.status || ""));
}

function severity(count: number, denominator: number, high = 0.15, medium = 0.06): AnalyticsSeverity {
  if (!count) return "low";
  const share = denominator ? count / denominator : 0;
  if (count >= 5 || share >= high) return "high";
  if (count >= 2 || share >= medium) return "medium";
  return "low";
}

function rankSeverity(value: AnalyticsSeverity) {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}

function dateWithin(value: unknown, start: Date, end: Date) {
  if (!value) return false;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) && date >= start && date < end;
}

export async function buildBusinessAnalyticsWithInbox(snapshot: SnapshotLike, days = 90, now = new Date()) {
  const base = buildBusinessAnalytics(snapshot, days, now);
  const leads = Array.isArray(snapshot.leads) ? snapshot.leads : [];
  const offers = Array.isArray(snapshot.offers) ? snapshot.offers : [];
  const leadMap = new Map(leads.map((lead) => [String(lead.id), lead]));
  const categoryForLead = (lead: any) => serviceCategoryForLead(lead, offers);
  const categoryFromSample = (sample: any) => {
    const lead = leadMap.get(String(sample?.id || ""));
    return lead ? categoryForLead(lead) : harmonizeServiceCategory(sample?.service || "", offers);
  };

  const periodStart = new Date(base.period.start);
  const periodEnd = new Date(base.period.end);
  const periodLeads = leads.filter((lead) => dateWithin(lead.createdAt || lead.created_at, periodStart, periodEnd));
  const servicePerformance = summarizeServiceCategories(periodLeads, offers);
  const currentConverted = leads.filter((lead) => String(lead.status || "") === "CONVERTED").length;
  const leadTrend = base.leadTrend.map((row) => ({
    ...row,
    cohortConversionRate: precisePercentage(Number(row.convertedCohort || 0), Number(row.newLeads || 0))
  }));

  const inbox = await buildInboxConversationIntelligence(leads, 40);
  const active = leads.filter(activeLead);

  const withSignal = (key: SignalKey) => active.filter((lead) => inbox.signalMap.get(String(lead.id))?.signals[key]);
  const sample = (rows: any[], key: SignalKey) => rows.slice(0, 5).map((lead) => {
    const signal = inbox.signalMap.get(String(lead.id));
    return {
      id: String(lead.id),
      name: lead.name ? String(lead.name) : null,
      phone: String(lead.phone || ""),
      status: String(lead.status || ""),
      service: categoryForLead(lead),
      excerpt: signal?.evidence[key]?.[0] || signal?.latestClientExcerpt || null
    };
  });

  const stalledIntent = withSignal("buyerIntent").filter((lead) => Number(lead.inactiveDays || 0) >= 2);
  const priceConcern = withSignal("priceConcern");
  const trustConcern = withSignal("trustConcern");
  const unanswered = withSignal("unansweredClientQuestion");
  const continuityFriction = active.filter((lead) => {
    const signals = inbox.signalMap.get(String(lead.id))?.signals;
    return Boolean(signals?.clientFrustration || signals?.repeatedAgentQuestion || signals?.repeatedAcknowledgement);
  });

  const conversationGaps: AnalyticsGap[] = [
    {
      key: "inbox-stalled-buyer-intent",
      title: "Buying intent stalled in the inbox",
      count: stalledIntent.length,
      severity: severity(stalledIntent.length, active.length, 0.1, 0.04),
      detail: "Recent client messages show buying intent, pricing, quotation, payment or start language, but the conversation has been inactive for at least 2 days.",
      recommendation: "Review the latest client message and send one context-specific next step: quotation, payment instruction, clarification or a concise follow-up. Do not restart qualification unnecessarily.",
      sampleLeads: sample(stalledIntent, "buyerIntent")
    },
    {
      key: "inbox-price-objection",
      title: "Price concerns in active conversations",
      count: priceConcern.length,
      severity: severity(priceConcern.length, active.length, 0.12, 0.05),
      detail: "Active inbox conversations contain affordability, price, discount, charges or budget concerns.",
      recommendation: "Respond to the specific value concern, confirm the correct catalogue/package price and avoid discounting automatically. Escalate only when a genuine pricing exception is needed.",
      sampleLeads: sample(priceConcern, "priceConcern")
    },
    {
      key: "inbox-trust-objection",
      title: "Trust and credibility concerns",
      count: trustConcern.length,
      severity: severity(trustConcern.length, active.length, 0.1, 0.04),
      detail: "Active clients are asking about authenticity, legitimacy, proof, registration, reviews or organisational credibility.",
      recommendation: "Use concise, verifiable trust signals at the moment they are relevant: official website, registration details, genuine reviews, documented quotation process or a human handover when needed.",
      sampleLeads: sample(trustConcern, "trustConcern")
    },
    {
      key: "inbox-continuity-friction",
      title: "Conversation continuity friction",
      count: continuityFriction.length,
      severity: severity(continuityFriction.length, active.length, 0.08, 0.03),
      detail: "Recent inbox histories show client frustration, repeated agent questions or repeated stock acknowledgements that may make the conversation feel scripted or forgetful.",
      recommendation: "Review the stored answers before asking another question, vary acknowledgements, and move the client to the next unresolved sales step instead of repeating earlier qualification.",
      sampleLeads: continuityFriction.slice(0, 5).map((lead) => {
        const row = inbox.signalMap.get(String(lead.id));
        const key: SignalKey = row?.signals.clientFrustration ? "clientFrustration" : row?.signals.repeatedAgentQuestion ? "repeatedAgentQuestion" : "repeatedAcknowledgement";
        return sample([lead], key)[0];
      })
    },
    {
      key: "inbox-unanswered-question",
      title: "Latest client questions without a reply",
      count: unanswered.length,
      severity: unanswered.length ? "high" : "low",
      detail: "The stored inbox history ends with a client question and no later agent response.",
      recommendation: "Prioritise these conversations first. Answer the actual question directly, then give one clear next step if a sales action is appropriate.",
      sampleLeads: sample(unanswered, "unansweredClientQuestion")
    }
  ];

  const baseGaps = base.gaps.map((gap) => ({
    ...gap,
    sampleLeads: gap.sampleLeads.map((row) => ({ ...row, service: categoryFromSample(row) }))
  }));
  const gaps = [...baseGaps, ...conversationGaps].sort((a, b) => rankSeverity(b.severity) - rankSeverity(a.severity) || b.count - a.count);

  const inboxPatterns = inbox.patterns.map((pattern) => ({
    ...pattern,
    sampleLeads: pattern.sampleLeads.map((row) => ({ ...row, service: categoryFromSample(row) }))
  }));

  return {
    ...base,
    summary: {
      ...base.summary,
      overallConversionRate: precisePercentage(currentConverted, leads.length)
    },
    leadTrend,
    serviceCategories: SERVICE_CATEGORY_ORDER,
    servicePerformance,
    inbox: {
      analysedLeads: inbox.analysedLeads,
      analysedMessages: inbox.analysedMessages,
      patterns: inboxPatterns
    },
    gaps,
    limitations: [
      ...base.limitations,
      "Percentages use one-decimal precision. Service lead share is calculated as service leads divided by all leads in the selected period; service conversion is converted leads divided by leads in that service category.",
      "Management service reporting is harmonized into five categories: Research Support Services, Online Courses, Pa Gym Services, Software, AI & Automation, and Others. Exact service names remain available internally for quotations and fulfilment.",
      "Inbox conversation signals are pattern-based screening of recent stored messages. They identify conversations worth reviewing but do not prove the client’s underlying motive or sentiment.",
      "Only recent stored inbox turns are analysed per lead, so very old objections may not appear if they are outside the current analysis window."
    ]
  };
}
