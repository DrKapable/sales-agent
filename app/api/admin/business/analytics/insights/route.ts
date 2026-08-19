import { gateway, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildBusinessAnalyticsWithInbox } from "@/lib/business-analytics-with-inbox";
import { buildInboxConversationReview } from "@/lib/inbox-conversation-review";
import { getFastBusinessSnapshot } from "@/lib/business-snapshot-fast";
import { getAiModelCandidates } from "@/lib/env";

const schema = z.object({
  days: z.number().int().min(7).max(365).default(90),
  question: z.string().trim().max(700).optional()
});

type Analytics = Awaited<ReturnType<typeof buildBusinessAnalyticsWithInbox>>;

function fallbackInsight(analytics: Analytics) {
  const major = analytics.gaps.filter((gap) => gap.count > 0).slice(0, 5);
  const service = analytics.servicePerformance[0];
  const inbox = analytics.inbox.patterns.filter((row) => row.count > 0).slice(0, 3);
  const lines = [
    `Executive readout: ${analytics.summary.periodLeads} leads entered the CRM in the selected period. Overall conversion is ${analytics.summary.overallConversionRate}%, with ${analytics.summary.currentHotLeads} hot active leads and K${Math.round(analytics.summary.verifiedRevenue).toLocaleString()} in verified revenue during the selected period.`,
    major.length
      ? `Main gaps: ${major.map((gap) => `${gap.title} (${gap.count})`).join("; ")}.`
      : "Main gaps: No material gap signal is currently above zero.",
    inbox.length
      ? `Inbox signals: ${inbox.map((row) => `${row.label} (${row.count})`).join("; ")}. Recent stored inbox messages were included in this screening.`
      : `Inbox signals: ${analytics.inbox.analysedLeads} conversations were screened and no configured conversation signal is currently above zero.`,
    service
      ? `Service signal: ${service.service} has the highest observed lead volume in the selected period (${service.leads} leads; ${service.conversionRate}% currently converted).`
      : "Service signal: There is not enough service-level data in the selected period.",
    major.length
      ? `Recommended priority: ${major[0].recommendation}`
      : "Recommended priority: Keep monitoring lead response time, qualification completeness and payment-stage follow-through."
  ];
  return lines.join("\n\n");
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid analytics request." }, { status: 400 });

  try {
    const snapshot = await getFastBusinessSnapshot();
    const [analytics, inboxConversations] = await Promise.all([
      buildBusinessAnalyticsWithInbox(snapshot, parsed.data.days),
      buildInboxConversationReview(snapshot.leads, 20, 10)
    ]);
    const analyticalContext = {
      period: analytics.period,
      summary: analytics.summary,
      leadTrend: analytics.leadTrend,
      revenueTrend: analytics.revenueTrend,
      quoteTrend: analytics.quoteTrend,
      statusDistribution: analytics.statusDistribution,
      sourceMix: analytics.sourceMix,
      servicePerformance: analytics.servicePerformance,
      inactivityDistribution: analytics.inactivityDistribution,
      inbox: {
        analysedLeads: analytics.inbox.analysedLeads,
        analysedMessages: analytics.inbox.analysedMessages,
        patterns: analytics.inbox.patterns,
        priorityConversations: inboxConversations
      },
      gaps: analytics.gaps.map((gap) => ({
        key: gap.key,
        title: gap.title,
        count: gap.count,
        severity: gap.severity,
        detail: gap.detail,
        recommendation: gap.recommendation,
        sampleLeads: gap.sampleLeads
      })),
      limitations: analytics.limitations
    };

    const instructions = `You are the MedMinds Business Analytics AI for an authenticated administrator. Analyse only the supplied MedMinds analytics and inbox dataset.\n\nRULES\n- Ground every conclusion in the supplied numbers, chart series, inbox patterns, recent conversation turns, client excerpts or gap signals.\n- You are given recent turns from a bounded set of the highest-priority active inbox conversations. Read those turns semantically and identify useful gaps that the predefined pattern screen may have missed.\n- Recent inbox messages are also screened for buying intent, price objections, trust concerns, timing objections, client frustration, repeated agent questions, repeated stock acknowledgements and unanswered latest client questions. Use both the semantic turns and the structured screen.\n- Treat short client excerpts and conversation turns as evidence of what was written, not proof of the client’s underlying motive or sentiment.\n- Do not invent causes, revenue, client behaviour, conversion events or trends that the data does not show.\n- Separate an observed signal from a possible interpretation. Use cautious language for interpretation.\n- Treat cohort conversion correctly: it is the current conversion outcome of leads grouped by acquisition period, not a historical conversion-event timeline.\n- Prioritise actions that can improve conversion, qualification quality, conversation continuity, follow-up discipline, payment completion or data capture.\n- Highlight contradictions or workflow mismatches, especially PAYMENT PENDING leads without linked payment records, INTERESTED leads without quotations, buying intent that has stalled, and client questions that remain unanswered.\n- If repeated questions, repeated acknowledgement openers or client frustration are present, recommend reviewing the existing answers before Mary asks another qualification question.\n- Look for other message-level gaps such as an objection that was not addressed, a client request that was answered indirectly, a clear buying signal without a concrete next step, or a handover that appears necessary.\n- Do not recommend spammy or high-frequency outreach. Keep follow-up relevant to the client’s known context.\n- If a sample client is mentioned, use only the supplied CRM identity and conversation text.\n- Return a concise management analysis with four sections: Executive readout, Conversion and inbox gaps, Recommendations, What to watch next.\n- Give at most 6 recommendations, ordered by likely operational impact.\n- Include numbers in the analysis where they support the point.\n- Mention material data limitations when they affect interpretation.\n\nANALYTICS AND INBOX DATA\n${JSON.stringify(analyticalContext)}`;

    const prompt = parsed.data.question?.trim()
      ? `Analyse all charts, inbox conversations, message signals and gaps, with extra attention to this management question: ${parsed.data.question}`
      : "Analyse all charts, priority inbox conversations, message signals and gaps and give management the most important findings and recommendations.";

    const models = getAiModelCandidates();
    let lastError: unknown = null;
    for (const model of models) {
      try {
        const agent = new ToolLoopAgent({ model: gateway(model), instructions, tools: {} });
        const result = await agent.generate({ prompt });
        const analysis = result.text.trim();
        if (analysis) return NextResponse.json({ analysis, mode: "agent", model, generatedAt: new Date().toISOString() });
      } catch (error) {
        lastError = error;
        console.warn("Business analytics AI attempt failed", { model, error });
      }
    }

    console.error("Business analytics AI failed across all models", { error: lastError });
    return NextResponse.json({ analysis: fallbackInsight(analytics), mode: "fallback", generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Business analytics insight generation failed", { error });
    return NextResponse.json({ error: "Unable to analyse business analytics right now." }, { status: 500 });
  }
}
