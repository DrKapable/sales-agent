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
  const major = analytics.gaps.filter((gap) => gap.count > 0).slice(0, 4);
  const service = analytics.servicePerformance[0];
  const inbox = analytics.inbox.patterns.filter((row) => row.count > 0).slice(0, 4);
  const sections: string[] = [
    "## Executive summary",
    `- **${analytics.summary.periodLeads} leads** entered the CRM in the selected period and overall conversion is **${analytics.summary.overallConversionRate}%**.`,
    `- There are **${analytics.summary.currentHotLeads} hot active leads** and **K${Math.round(analytics.summary.verifiedRevenue).toLocaleString()}** in verified revenue for the period.`,
    "## What the charts show"
  ];

  sections.push(service
    ? `- **${service.service}** has the highest observed lead volume (${service.leads} leads; ${service.conversionRate}% currently converted).`
    : "- There is not enough service-level data in the selected period.");

  sections.push("## What clients are saying");
  if (inbox.length) {
    sections.push(...inbox.map((row) => `- **${row.label}:** ${row.count} conversation${row.count === 1 ? "" : "s"} flagged in recent inbox screening.`));
  } else {
    sections.push(`- **${analytics.inbox.analysedLeads} conversations** were screened and no configured message-level signal is currently above zero.`);
  }

  sections.push("## Conversion and inbox gaps");
  if (major.length) {
    sections.push(...major.map((gap) => `- **${gap.title}:** ${gap.count}. ${gap.detail}`));
  } else {
    sections.push("- No material conversion or inbox gap signal is currently above zero.");
  }

  sections.push("## Recommended actions");
  if (major.length) {
    sections.push(...major.slice(0, 4).map((gap, index) => `${index + 1}. ${gap.recommendation}`));
  } else {
    sections.push("1. Keep monitoring qualification quality, response continuity, follow-up discipline and payment-stage completion.");
  }

  sections.push(
    "## What to watch next",
    "- Watch whether hot leads move to quotation/payment, whether unanswered client questions fall, and whether conversion improves as newer cohorts mature."
  );
  return sections.join("\n\n");
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid analytics request." }, { status: 400 });

  try {
    const snapshot = await getFastBusinessSnapshot();
    const [analytics, inboxConversations] = await Promise.all([
      buildBusinessAnalyticsWithInbox(snapshot, parsed.data.days),
      buildInboxConversationReview(snapshot.leads, 30, 12)
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

    const instructions = `You are the MedMinds Business Analytics AI for an authenticated administrator. Analyse the supplied charts, CRM pipeline, inbox messages and operational gaps as one connected management dataset.\n\nRULES\n- Ground every conclusion in the supplied numbers, chart series, inbox patterns, recent conversation turns, client excerpts or gap signals.\n- The inbox dataset includes broad recent-message screening plus semantic review of recent turns from up to 30 high-priority active conversations. You MUST use the inbox evidence in every full management analysis.\n- Include a dedicated section called \"What clients are saying\" even when no strong message-level pattern is present. If no material pattern is present, say that clearly.\n- Read the priority conversation turns semantically. Look for buying signals, unanswered questions, objections, uncertainty, repeated qualification, indirect answers, premature handoffs, poor continuity, trust concerns, price resistance and missed next steps.\n- Use the structured inbox screening as corroborating evidence for buying intent, price concerns, trust concerns, timing concerns, client frustration, repeated agent questions, repeated stock acknowledgements and unanswered latest client questions.\n- Treat client excerpts as evidence of what was written, not proof of motive or sentiment. Separate observed facts from possible interpretations.\n- Do not invent causes, revenue, client behaviour, conversion events or trends that the data does not show.\n- Treat cohort conversion correctly: it is the current conversion outcome of leads grouped by acquisition period, not a historical conversion-event timeline.\n- Prioritise actions that improve conversion, qualification quality, message continuity, response quality, follow-up discipline, payment completion or data capture.\n- Highlight contradictions and workflow mismatches, especially PAYMENT PENDING without payment records, INTERESTED without quotations, buying intent without a next step, unanswered questions, repeated questions, or a handoff that happened before qualification was complete.\n- Do not recommend spammy or high-frequency outreach. Keep follow-up relevant to the known client context.\n- Mention named/sample clients only when the supplied evidence makes the example operationally useful.\n\nOUTPUT FORMAT\n- Use these six Markdown headings exactly: ## Executive summary; ## What the charts show; ## What clients are saying; ## Conversion and inbox gaps; ## Recommended actions; ## What to watch next.\n- Under each heading use short bullets. Avoid long paragraphs.\n- Keep most bullets to one or two sentences.\n- Use **bold** only for key numbers, service categories, or important labels.\n- Give at most 5 recommended actions, ordered by likely operational impact.\n- Prefer plain management language over technical analytics jargon.\n- Do not use Markdown tables.\n- Mention material data limitations only where they change interpretation.\n\nANALYTICS AND INBOX DATA\n${JSON.stringify(analyticalContext)}`;

    const prompt = parsed.data.question?.trim()
      ? `Analyse the charts, pipeline and inbox messages together, with extra attention to this management question: ${parsed.data.question}`
      : "Analyse the charts, pipeline, inbox messages and gaps together and give management the clearest conversion findings and recommended actions.";

    const models = getAiModelCandidates();
    let lastError: unknown = null;
    for (const model of models) {
      try {
        const agent = new ToolLoopAgent({ model: gateway(model), instructions, tools: {} });
        const result = await agent.generate({ prompt });
        const analysis = result.text.trim();
        if (analysis) return NextResponse.json({
          analysis,
          mode: "agent",
          model,
          generatedAt: new Date().toISOString(),
          inboxCoverage: {
            screenedConversations: analytics.inbox.analysedLeads,
            screenedMessages: analytics.inbox.analysedMessages,
            semanticConversations: inboxConversations.length,
            semanticTurns: inboxConversations.reduce((sum, conversation) => sum + conversation.turns.length, 0)
          }
        });
      } catch (error) {
        lastError = error;
        console.warn("Business analytics AI attempt failed", { model, error });
      }
    }

    console.error("Business analytics AI failed across all models", { error: lastError });
    return NextResponse.json({
      analysis: fallbackInsight(analytics),
      mode: "fallback",
      generatedAt: new Date().toISOString(),
      inboxCoverage: {
        screenedConversations: analytics.inbox.analysedLeads,
        screenedMessages: analytics.inbox.analysedMessages,
        semanticConversations: inboxConversations.length,
        semanticTurns: inboxConversations.reduce((sum, conversation) => sum + conversation.turns.length, 0)
      }
    });
  } catch (error) {
    console.error("Business analytics insight generation failed", { error });
    return NextResponse.json({ error: "Unable to analyse business analytics and inbox messages right now." }, { status: 500 });
  }
}
