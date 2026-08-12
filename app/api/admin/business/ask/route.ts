import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessSnapshot } from "@/lib/business-ops";

const schema = z.object({ question: z.string().trim().min(3).max(500) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a business question." }, { status: 400 });
  const snapshot = await getBusinessSnapshot();
  const q = parsed.data.question.toLowerCase();
  let answer = "";

  if (/conversion|convert/.test(q)) {
    answer = `Current conversion is ${snapshot.metrics.conversionRate}%: ${snapshot.metrics.converted} of ${snapshot.metrics.totalLeads} leads are converted. There are ${snapshot.metrics.hotLeads} hot unconverted leads and ${snapshot.metrics.paymentPending} payment-pending leads.`;
  } else if (/best|top|most.*service|service.*lead|service.*perform/.test(q)) {
    const top = snapshot.services.slice(0, 5);
    answer = top.length ? `Top services by lead volume: ${top.map((row) => `${row.service} (${row.leads} leads, ${row.conversionRate}% converted)`).join("; ")}.` : "There is not enough service data yet.";
  } else if (/lost|why.*not|reason/.test(q)) {
    answer = snapshot.lostReasons.length ? `Main lost-lead signals: ${snapshot.lostReasons.slice(0, 5).map((row) => `${row.reason} (${row.count})`).join("; ")}.` : "No lost-lead reasons have been identified yet.";
  } else if (/hot|priority|who.*follow|lead.*attention/.test(q)) {
    const hot = snapshot.leads.filter((lead) => lead.scoreBand === "HOT" && lead.status !== "CONVERTED").slice(0, 8);
    answer = hot.length ? `Highest-priority leads: ${hot.map((lead) => `${lead.name || lead.phone}, score ${lead.leadScore}/100, ${lead.serviceInterest || "service not established"}, status ${lead.status}`).join("; ")}.` : "There are currently no hot unconverted leads.";
  } else if (/follow.?up|overdue/.test(q)) {
    answer = `${snapshot.metrics.followUpsDue} leads currently have follow-ups due. ${snapshot.leads.filter((lead) => lead.followUpAt && new Date(lead.followUpAt).getTime() <= Date.now() && !["CONVERTED", "LOST LEAD"].includes(lead.status)).slice(0, 8).map((lead) => lead.name || lead.phone).join(", ") || "None are overdue right now."}`;
  } else if (/payment/.test(q)) {
    answer = `${snapshot.metrics.paymentPending} leads are currently marked payment pending. ${snapshot.payments.filter((payment: any) => payment.status === "PENDING").length} payment records are awaiting verification in the business centre.`;
  } else {
    answer = `MedMinds currently has ${snapshot.metrics.totalLeads} leads, ${snapshot.metrics.conversionRate}% conversion, ${snapshot.metrics.hotLeads} hot unconverted leads, ${snapshot.metrics.followUpsDue} follow-ups due and ${snapshot.metrics.paymentPending} payment-pending leads. Ask about top services, lost leads, hot leads, payments or follow-ups for a more specific answer.`;
  }
  return NextResponse.json({ answer });
}
