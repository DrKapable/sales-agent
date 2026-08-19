import { gateway, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildBusinessAnalytics } from "@/lib/business-analytics";
import { getFastBusinessSnapshot } from "@/lib/business-snapshot-fast";
import { getAiModelCandidates } from "@/lib/env";

const schema = z.object({
  days: z.number().int().min(7).max(365).default(90),
  question: z.string().trim().max(700).optional()
});

function fallbackInsight(analytics: ReturnType<typeof buildBusinessAnalytics>) {
  const major = analytics.gaps.filter((gap) => gap.count > 0).slice(0, 4);
  const service = analytics.servicePerformance[0];
  const lines = [
    `Executive readout: ${analytics.summary.periodLeads} leads entered the CRM in the selected period. Overall conversion is ${analytics.summary.overallConversionRate}%, with ${analytics.summary.currentHotLeads} hot active leads and K${Math.round(analytics.summary.verifiedRevenue).toLocaleString()} in verified revenue during the selected period.`,
    major.length
      ? `Main gaps: ${major.map((gap) => `${gap.title} (${gap.count})`).join("; ")}.`
      : "Main gaps: No material gap signal is currently above zero.",
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
    const analytics = buildBusinessAnalytics(snapshot, parsed.data.days);
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

    const instructions = `You are the MedMinds Business Analytics AI for an authenticated administrator. Analyse only the supplied MedMinds analytics dataset.\n\nRULES\n- Ground every conclusion in the supplied numbers, chart series or gap signals.\n- Do not invent causes, revenue, client behaviour, conversion events or trends that the data does not show.\n- Separate an observed signal from a possible interpretation. Use cautious language for interpretation.\n- Treat cohort conversion correctly: it is the current conversion outcome of leads grouped by acquisition period, not a historical conversion-event timeline.\n- Prioritise actions that can improve conversion, qualification quality, follow-up discipline, payment completion or data capture.\n- Highlight contradictions or workflow mismatches, especially PAYMENT PENDING leads without linked payment records or INTERESTED leads without quotations.\n- Do not recommend spammy or high-frequency outreach. Keep follow-up relevant to the client’s known context.\n- If a sample client is mentioned, use only the supplied sampleLeads data.\n- Return a concise management analysis with four sections: Executive readout, Conversion gaps, Recommendations, What to watch next.\n- Give at most 6 recommendations, ordered by likely operational impact.\n- Include numbers in the analysis where they support the point.\n- Mention material data limitations when they affect interpretation.\n\nANALYTICS DATA\n${JSON.stringify(analyticalContext)}`;

    const prompt = parsed.data.question?.trim()
      ? `Analyse all charts and gaps, with extra attention to this management question: ${parsed.data.question}`
      : "Analyse all charts and gaps and give management the most important findings and recommendations.";

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
