export type AnalyticsSeverity = "high" | "medium" | "low";
export type AnalyticsGap = {
  key: string;
  title: string;
  count: number;
  severity: AnalyticsSeverity;
  detail: string;
  recommendation: string;
  sampleLeads: Array<{ id: string; name: string | null; phone: string; status: string; service: string | null }>;
};

type SnapshotLike = {
  generatedAt?: string;
  metrics?: Record<string, number>;
  leads?: any[];
  services?: any[];
  payments?: any[];
  quotes?: any[];
  tasks?: any[];
  lostReasons?: any[];
};

type Granularity = "day" | "week" | "month";

type Bucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

function safeDate(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function labelDate(date: Date, granularity: Granularity) {
  if (granularity === "month") return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function buildBuckets(days: number, now: Date): { granularity: Granularity; buckets: Bucket[] } {
  const cleanDays = Math.max(7, Math.min(365, Math.round(days || 90)));
  if (cleanDays <= 45) {
    const start = startOfDay(addDays(now, -(cleanDays - 1)));
    return {
      granularity: "day",
      buckets: Array.from({ length: cleanDays }, (_, index) => {
        const bucketStart = addDays(start, index);
        return {
          key: bucketStart.toISOString().slice(0, 10),
          label: labelDate(bucketStart, "day"),
          start: bucketStart,
          end: addDays(bucketStart, 1)
        };
      })
    };
  }

  if (cleanDays <= 150) {
    const bucketCount = Math.ceil(cleanDays / 7);
    const start = startOfDay(addDays(now, -(bucketCount * 7 - 1)));
    return {
      granularity: "week",
      buckets: Array.from({ length: bucketCount }, (_, index) => {
        const bucketStart = addDays(start, index * 7);
        return {
          key: bucketStart.toISOString().slice(0, 10),
          label: labelDate(bucketStart, "week"),
          start: bucketStart,
          end: addDays(bucketStart, 7)
        };
      })
    };
  }

  const monthCount = Math.min(12, Math.max(6, Math.ceil(cleanDays / 30)));
  const currentMonth = startOfMonth(now);
  const start = addMonths(currentMonth, -(monthCount - 1));
  return {
    granularity: "month",
    buckets: Array.from({ length: monthCount }, (_, index) => {
      const bucketStart = addMonths(start, index);
      return {
        key: `${bucketStart.getFullYear()}-${String(bucketStart.getMonth() + 1).padStart(2, "0")}`,
        label: labelDate(bucketStart, "month"),
        start: bucketStart,
        end: addMonths(bucketStart, 1)
      };
    })
  };
}

function bucketIndex(date: Date, buckets: Bucket[]) {
  return buckets.findIndex((bucket) => date >= bucket.start && date < bucket.end);
}

function serviceForLead(lead: any) {
  return String(lead?.serviceInterest || lead?.packageName || "").trim() || null;
}

function activeLead(lead: any) {
  return !["CONVERTED", "LOST LEAD"].includes(String(lead?.status || ""));
}

function sampleLeads(leads: any[]) {
  return leads.slice(0, 5).map((lead) => ({
    id: String(lead.id),
    name: lead.name ? String(lead.name) : null,
    phone: String(lead.phone || ""),
    status: String(lead.status || ""),
    service: serviceForLead(lead)
  }));
}

function severity(count: number, totalActive: number, highThreshold = 0.18, mediumThreshold = 0.08): AnalyticsSeverity {
  if (!count) return "low";
  const share = totalActive ? count / totalActive : 0;
  if (count >= 5 || share >= highThreshold) return "high";
  if (count >= 2 || share >= mediumThreshold) return "medium";
  return "low";
}

export function buildBusinessAnalytics(snapshot: SnapshotLike, days = 90, now = new Date()) {
  const leads = Array.isArray(snapshot.leads) ? snapshot.leads : [];
  const payments = Array.isArray(snapshot.payments) ? snapshot.payments : [];
  const quotes = Array.isArray(snapshot.quotes) ? snapshot.quotes : [];
  const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  const { granularity, buckets } = buildBuckets(days, now);
  const periodStart = buckets[0]?.start ?? addDays(now, -90);
  const periodEnd = buckets.at(-1)?.end ?? now;

  const leadSeries = buckets.map((bucket) => ({ period: bucket.label, newLeads: 0, convertedCohort: 0, cohortConversionRate: 0 }));
  const revenueSeries = buckets.map((bucket) => ({ period: bucket.label, verifiedRevenue: 0, verifiedPayments: 0 }));
  const quoteSeries = buckets.map((bucket) => ({ period: bucket.label, quotations: 0, quotedValue: 0 }));

  const periodLeads = leads.filter((lead) => {
    const created = safeDate(lead.createdAt || lead.created_at);
    return Boolean(created && created >= periodStart && created < periodEnd);
  });

  for (const lead of periodLeads) {
    const created = safeDate(lead.createdAt || lead.created_at);
    if (!created) continue;
    const index = bucketIndex(created, buckets);
    if (index < 0) continue;
    leadSeries[index].newLeads += 1;
    if (lead.status === "CONVERTED") leadSeries[index].convertedCohort += 1;
  }
  leadSeries.forEach((row) => {
    row.cohortConversionRate = row.newLeads ? Math.round((row.convertedCohort / row.newLeads) * 100) : 0;
  });

  for (const payment of payments) {
    if (String(payment.status) !== "VERIFIED") continue;
    const verifiedAt = safeDate(payment.verified_at || payment.verifiedAt || payment.created_at || payment.createdAt);
    if (!verifiedAt) continue;
    const index = bucketIndex(verifiedAt, buckets);
    if (index < 0) continue;
    revenueSeries[index].verifiedPayments += 1;
    revenueSeries[index].verifiedRevenue += Number(payment.amount_zmw ?? payment.amountZmw ?? 0) || 0;
  }

  for (const quote of quotes) {
    const created = safeDate(quote.created_at || quote.createdAt);
    if (!created) continue;
    const index = bucketIndex(created, buckets);
    if (index < 0) continue;
    quoteSeries[index].quotations += 1;
    quoteSeries[index].quotedValue += Number(quote.amount_zmw ?? quote.amountZmw ?? 0) || 0;
  }

  const statusCounts = new Map<string, number>();
  leads.forEach((lead) => {
    const status = String(lead.status || "UNKNOWN");
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  });
  const preferredStatusOrder = ["NEW LEAD", "QUALIFIED", "INTERESTED", "PAYMENT PENDING", "FOLLOW-UP REQUIRED", "HUMAN ASSISTANCE REQUIRED", "CONVERTED", "LOST LEAD"];
  const statusDistribution = [...statusCounts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => {
      const ai = preferredStatusOrder.indexOf(a.status);
      const bi = preferredStatusOrder.indexOf(b.status);
      if (ai === -1 && bi === -1) return b.count - a.count;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  const sourceCounts = new Map<string, number>();
  periodLeads.forEach((lead) => {
    const source = String(lead.source || "Unknown").trim() || "Unknown";
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
  });
  const sourceMix = [...sourceCounts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);

  const periodServiceCounts = new Map<string, { leads: number; converted: number }>();
  periodLeads.forEach((lead) => {
    const service = serviceForLead(lead) || "Not established";
    const row = periodServiceCounts.get(service) || { leads: 0, converted: 0 };
    row.leads += 1;
    if (lead.status === "CONVERTED") row.converted += 1;
    periodServiceCounts.set(service, row);
  });
  const servicePerformance = [...periodServiceCounts.entries()]
    .map(([service, row]) => ({ service, leads: row.leads, converted: row.converted, conversionRate: row.leads ? Math.round((row.converted / row.leads) * 100) : 0 }))
    .sort((a, b) => b.leads - a.leads || b.conversionRate - a.conversionRate)
    .slice(0, 12);

  const active = leads.filter(activeLead);
  const inactivityBuckets = [
    { bucket: "0–1 day", min: 0, max: 1, count: 0 },
    { bucket: "2–3 days", min: 2, max: 3, count: 0 },
    { bucket: "4–7 days", min: 4, max: 7, count: 0 },
    { bucket: "8–14 days", min: 8, max: 14, count: 0 },
    { bucket: "15+ days", min: 15, max: Infinity, count: 0 }
  ];
  active.forEach((lead) => {
    const inactiveDays = Number(lead.inactiveDays || 0);
    const bucket = inactivityBuckets.find((row) => inactiveDays >= row.min && inactiveDays <= row.max);
    if (bucket) bucket.count += 1;
  });

  const quoteLeadIds = new Set(quotes.map((quote) => String(quote.lead_id || quote.leadId || "")).filter(Boolean));
  const paymentLeadIds = new Set(payments.map((payment) => String(payment.lead_id || payment.leadId || "")).filter(Boolean));
  const hotUnconverted = active.filter((lead) => String(lead.scoreBand) === "HOT" || Number(lead.leadScore || 0) >= 70);
  const staleWarmHot = active.filter((lead) => Number(lead.leadScore || 0) >= 45 && Number(lead.inactiveDays || 0) >= 3);
  const noService = active.filter((lead) => !serviceForLead(lead));
  const deadlineRelevant = active.filter((lead) => /research|proposal|dissertation|thesis|methodology|data analysis|software|website|automation|development/i.test(serviceForLead(lead) || ""));
  const noDeadline = deadlineRelevant.filter((lead) => !String(lead.deadline || "").trim());
  const noFollowUp = active.filter((lead) => Number(lead.inactiveDays || 0) >= 2 && !lead.followUpAt);
  const interestedNoQuote = active.filter((lead) => String(lead.status) === "INTERESTED" && !quoteLeadIds.has(String(lead.id)));
  const paymentNoRecord = active.filter((lead) => String(lead.status) === "PAYMENT PENDING" && !paymentLeadIds.has(String(lead.id)));
  const lostUnknown = leads.filter((lead) => String(lead.status) === "LOST LEAD" && (!lead.lostReason || String(lead.lostReason) === "Reason not established"));

  const gaps: AnalyticsGap[] = [
    {
      key: "hot-unconverted",
      title: "Hot leads not converted",
      count: hotUnconverted.length,
      severity: severity(hotUnconverted.length, active.length, 0.12, 0.05),
      detail: "High-intent leads remain in the active pipeline without conversion.",
      recommendation: "Prioritise personal sales follow-up, resolve the latest objection and give each lead one clear next action.",
      sampleLeads: sampleLeads(hotUnconverted)
    },
    {
      key: "stale-warm-hot",
      title: "Warm/hot leads going stale",
      count: staleWarmHot.length,
      severity: severity(staleWarmHot.length, active.length),
      detail: "These active leads have meaningful sales intent but have been inactive for at least 3 days.",
      recommendation: "Use a context-specific follow-up based on the client’s last stated goal, objection or unfinished step.",
      sampleLeads: sampleLeads(staleWarmHot)
    },
    {
      key: "missing-service",
      title: "Service need not established",
      count: noService.length,
      severity: severity(noService.length, active.length),
      detail: "The CRM does not yet show a clear service or package for these active leads.",
      recommendation: "Improve qualification capture so Mary stores the best-fit service as soon as the client’s need becomes clear.",
      sampleLeads: sampleLeads(noService)
    },
    {
      key: "missing-deadline",
      title: "Deadline missing on scoped work",
      count: noDeadline.length,
      severity: severity(noDeadline.length, Math.max(1, deadlineRelevant.length), 0.25, 0.1),
      detail: "Research and project-type leads have a service identified but no delivery deadline recorded.",
      recommendation: "Capture deadline before quoting or scheduling operational work because urgency affects prioritisation and fulfilment.",
      sampleLeads: sampleLeads(noDeadline)
    },
    {
      key: "follow-up-not-scheduled",
      title: "Inactive leads without follow-up",
      count: noFollowUp.length,
      severity: severity(noFollowUp.length, active.length),
      detail: "Active leads have been quiet for at least 2 days and no follow-up time is stored.",
      recommendation: "Automatically schedule the next follow-up when a client says later, goes quiet after a buying signal, or leaves payment incomplete.",
      sampleLeads: sampleLeads(noFollowUp)
    },
    {
      key: "interested-no-quote",
      title: "Interested leads without quotation",
      count: interestedNoQuote.length,
      severity: severity(interestedNoQuote.length, active.length, 0.1, 0.04),
      detail: "Clients are marked interested but no saved quotation is linked to their CRM record.",
      recommendation: "Check whether each client is genuinely ready for a quote; if qualified, prepare one promptly instead of leaving the lead in limbo.",
      sampleLeads: sampleLeads(interestedNoQuote)
    },
    {
      key: "payment-stage-no-record",
      title: "Payment stage without payment record",
      count: paymentNoRecord.length,
      severity: paymentNoRecord.length ? ("high" as const) : ("low" as const),
      detail: "The CRM says payment is pending but Business Intelligence has no linked payment record.",
      recommendation: "Reconcile the payment workflow so every PAYMENT PENDING lead has a traceable payment record or a clearly documented next payment step.",
      sampleLeads: sampleLeads(paymentNoRecord)
    },
    {
      key: "lost-reason-unknown",
      title: "Lost leads without a clear reason",
      count: lostUnknown.length,
      severity: severity(lostUnknown.length, Math.max(1, leads.filter((lead) => lead.status === "LOST LEAD").length), 0.3, 0.1),
      detail: "These lost leads do not have enough evidence to classify the main loss reason.",
      recommendation: "Capture the final objection or loss reason at closure so future marketing and sales recommendations are evidence-based.",
      sampleLeads: sampleLeads(lostUnknown)
    }
  ].sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[b.severity] - rank[a.severity] || b.count - a.count;
  });

  const verifiedPaymentsInPeriod = payments.filter((payment) => {
    if (String(payment.status) !== "VERIFIED") return false;
    const date = safeDate(payment.verified_at || payment.verifiedAt || payment.created_at || payment.createdAt);
    return Boolean(date && date >= periodStart && date < periodEnd);
  });
  const quotationsInPeriod = quotes.filter((quote) => {
    const date = safeDate(quote.created_at || quote.createdAt);
    return Boolean(date && date >= periodStart && date < periodEnd);
  });
  const verifiedRevenue = verifiedPaymentsInPeriod.reduce((sum, payment) => sum + (Number(payment.amount_zmw ?? payment.amountZmw ?? 0) || 0), 0);
  const quotedValue = quotationsInPeriod.reduce((sum, quote) => sum + (Number(quote.amount_zmw ?? quote.amountZmw ?? 0) || 0), 0);
  const currentConverted = leads.filter((lead) => lead.status === "CONVERTED").length;
  const activeScores = active.map((lead) => Number(lead.leadScore || 0));
  const averageActiveScore = activeScores.length ? Math.round(activeScores.reduce((sum, score) => sum + score, 0) / activeScores.length) : 0;

  return {
    generatedAt: snapshot.generatedAt || now.toISOString(),
    period: {
      days: Math.max(7, Math.min(365, Math.round(days || 90))),
      granularity,
      start: periodStart.toISOString(),
      end: periodEnd.toISOString()
    },
    summary: {
      periodLeads: periodLeads.length,
      currentActiveLeads: active.length,
      currentHotLeads: hotUnconverted.length,
      overallConversionRate: leads.length ? Math.round((currentConverted / leads.length) * 100) : 0,
      averageActiveScore,
      verifiedRevenue,
      verifiedPayments: verifiedPaymentsInPeriod.length,
      quotations: quotationsInPeriod.length,
      quotedValue,
      openTasks: tasks.filter((task) => String(task.status) !== "COMPLETED").length
    },
    leadTrend: leadSeries,
    revenueTrend: revenueSeries,
    quoteTrend: quoteSeries,
    statusDistribution,
    sourceMix,
    servicePerformance,
    inactivityDistribution: inactivityBuckets.map(({ bucket, count }) => ({ bucket, count })),
    gaps,
    limitations: [
      "Cohort conversion shows the current conversion outcome of leads grouped by when they entered the CRM; it is not a historical conversion-event timeline because lead status transition timestamps are not currently stored.",
      "Gap signals identify operational opportunities from CRM fields and recent activity. They should guide review, not be treated as proof of why an individual client did not convert.",
      "Analytics reflect the records currently available to Business Intelligence and may be incomplete where older CRM records or payment/quotation records were not captured."
    ]
  };
}
