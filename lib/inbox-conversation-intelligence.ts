import { neon } from "@neondatabase/serverless";
import { getConversation } from "@/lib/store";

type LeadLike = {
  id: string;
  phone: string;
  name?: string | null;
  status?: string | null;
  serviceInterest?: string | null;
  packageName?: string | null;
  inactiveDays?: number | null;
};

type Turn = { role: string; content: string; createdAt?: string | null };

type SignalKey =
  | "priceConcern"
  | "trustConcern"
  | "timingConcern"
  | "buyerIntent"
  | "clientFrustration"
  | "repeatedAgentQuestion"
  | "repeatedAcknowledgement"
  | "unansweredClientQuestion";

export type InboxLeadSignals = {
  leadId: string;
  phone: string;
  signals: Record<SignalKey, boolean>;
  evidence: Partial<Record<SignalKey, string[]>>;
  clientMessages: number;
  agentMessages: number;
  latestClientExcerpt: string | null;
};

export type InboxPattern = {
  key: string;
  label: string;
  count: number;
  detail: string;
  sampleLeads: Array<{
    id: string;
    name: string | null;
    phone: string;
    status: string;
    service: string | null;
    excerpt: string | null;
  }>;
};

const clientPatterns: Array<{ key: SignalKey; regex: RegExp }> = [
  { key: "priceConcern", regex: /\b(expensive|too much|cannot afford|can(?:not|'t|’t) afford|affordability|discount|budget|cheaper|reduce (?:the )?price|lower (?:the )?price)\b/i },
  { key: "trustConcern", regex: /\b(authentic|authenticity|legit|legitimate|trust|trusted|scam|proof|registered|registration|reviews?|credible|credibility)\b/i },
  { key: "timingConcern", regex: /\b(later|not now|next week|next month|wait|hold on|think about|let me think|get back to you|i(?:'|’)ll come back)\b/i },
  { key: "buyerIntent", regex: /\b(how much|quotation|quote|invoice|ready to (?:proceed|start|pay)|proceed|payment|pay|subscribe|enrol|enroll|sign up|send (?:me )?(?:the )?(?:quote|quotation)|want to (?:start|proceed|pay|subscribe|enrol|enroll))\b/i },
  { key: "clientFrustration", regex: /\b(already told|already said|told you|said that already|you asked|asked me already|again|same question|repeat|repeating|forgot|forget|not answering|confus(?:ed|ing))\b/i }
];

function cleanExcerpt(value: string) {
  return value.replace(/^\[Human:[^\]]+\]\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 220);
}

function splitQuestions(value: string) {
  const cleaned = value.replace(/^\[Human:[^\]]+\]\s*/i, "");
  const matches = cleaned.match(/[^?]{4,}\?/g) || [];
  return matches.map((item) => item.trim()).filter(Boolean);
}

function normalizeQuestion(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/\d+/g, " number ")
    .replace(/[^a-z]+/g, " ")
    .replace(/\b(please|kindly|now|today|again)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function acknowledgementKey(value: string) {
  const text = cleanExcerpt(value).toLowerCase();
  const match = text.match(/^(that helps|thanks|thank you|got it|great|absolutely|okay|ok|makes sense|understood)\b/);
  return match?.[1] || null;
}

function looksLikeQuestion(value: string) {
  const text = cleanExcerpt(value);
  return text.includes("?") || /^(what|how|when|where|which|who|why|can|could|would|will|do|does|did|is|are|am|may|should)\b/i.test(text);
}

export function analyseConversationTurns(turns: Turn[]) {
  const signals: Record<SignalKey, boolean> = {
    priceConcern: false,
    trustConcern: false,
    timingConcern: false,
    buyerIntent: false,
    clientFrustration: false,
    repeatedAgentQuestion: false,
    repeatedAcknowledgement: false,
    unansweredClientQuestion: false
  };
  const evidence: Partial<Record<SignalKey, string[]>> = {};
  const clientTurns = turns.filter((turn) => turn.role === "user");
  const agentTurns = turns.filter((turn) => turn.role !== "user");

  for (const turn of clientTurns) {
    const excerpt = cleanExcerpt(turn.content);
    if (!excerpt) continue;
    for (const pattern of clientPatterns) {
      if (!pattern.regex.test(excerpt)) continue;
      signals[pattern.key] = true;
      const list = evidence[pattern.key] || [];
      if (list.length < 3 && !list.includes(excerpt)) list.push(excerpt);
      evidence[pattern.key] = list;
    }
  }

  const seenQuestions = new Set<string>();
  for (const turn of agentTurns) {
    for (const question of splitQuestions(turn.content)) {
      const normalized = normalizeQuestion(question);
      if (normalized.length < 10) continue;
      if (seenQuestions.has(normalized)) {
        signals.repeatedAgentQuestion = true;
        const excerpt = cleanExcerpt(question);
        const list = evidence.repeatedAgentQuestion || [];
        if (list.length < 3 && !list.includes(excerpt)) list.push(excerpt);
        evidence.repeatedAgentQuestion = list;
      }
      seenQuestions.add(normalized);
    }
  }

  const acknowledgementCounts = new Map<string, number>();
  for (const turn of agentTurns) {
    const key = acknowledgementKey(turn.content);
    if (!key) continue;
    const count = (acknowledgementCounts.get(key) || 0) + 1;
    acknowledgementCounts.set(key, count);
    if (count >= 2) {
      signals.repeatedAcknowledgement = true;
      const list = evidence.repeatedAcknowledgement || [];
      const excerpt = cleanExcerpt(turn.content);
      if (list.length < 3 && !list.includes(excerpt)) list.push(excerpt);
      evidence.repeatedAcknowledgement = list;
    }
  }

  let lastClientQuestionIndex = -1;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.role === "user" && looksLikeQuestion(turn.content)) {
      lastClientQuestionIndex = index;
      break;
    }
  }
  if (lastClientQuestionIndex >= 0) {
    const answeredAfter = turns.slice(lastClientQuestionIndex + 1).some((turn) => turn.role !== "user");
    if (!answeredAfter) {
      signals.unansweredClientQuestion = true;
      evidence.unansweredClientQuestion = [cleanExcerpt(turns[lastClientQuestionIndex].content)];
    }
  }

  const latestClient = [...clientTurns].reverse().find((turn) => cleanExcerpt(turn.content));
  return {
    signals,
    evidence,
    clientMessages: clientTurns.length,
    agentMessages: agentTurns.length,
    latestClientExcerpt: latestClient ? cleanExcerpt(latestClient.content) : null
  };
}

async function loadRecentTurns(leads: LeadLike[], perLead: number) {
  const grouped = new Map<string, Turn[]>();
  if (process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      const rows = await sql.query(`
        WITH recent_leads AS (
          SELECT phone FROM leads ORDER BY updated_at DESC LIMIT 200
        ), ranked AS (
          SELECT m.phone,m.role,m.content,m.created_at,
                 ROW_NUMBER() OVER (PARTITION BY m.phone ORDER BY m.created_at DESC) AS rn
          FROM messages m
          INNER JOIN recent_leads l ON l.phone=m.phone
        )
        SELECT phone,role,content,created_at
        FROM ranked
        WHERE rn <= $1
        ORDER BY phone,created_at
      `, [Math.max(10, Math.min(60, perLead))]);
      for (const row of rows as any[]) {
        const phone = String(row.phone || "");
        const list = grouped.get(phone) || [];
        list.push({ role: String(row.role || ""), content: String(row.content || ""), createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null });
        grouped.set(phone, list);
      }
      return grouped;
    } catch (error) {
      console.warn("Inbox conversation batch analysis fell back to per-lead reads", { error });
    }
  }

  await Promise.all(leads.slice(0, 200).map(async (lead) => {
    const messages = await getConversation(lead.phone, perLead);
    grouped.set(lead.phone, messages.map((message) => ({ role: message.role, content: message.content, createdAt: message.createdAt })));
  }));
  return grouped;
}

function serviceForLead(lead: LeadLike) {
  return lead.serviceInterest || lead.packageName || null;
}

export async function buildInboxConversationIntelligence(leads: LeadLike[], perLead = 40) {
  const recentTurns = await loadRecentTurns(leads, perLead);
  const leadSignals: InboxLeadSignals[] = leads.slice(0, 200).map((lead) => {
    const summary = analyseConversationTurns(recentTurns.get(lead.phone) || []);
    return { leadId: lead.id, phone: lead.phone, ...summary };
  });
  const signalMap = new Map(leadSignals.map((row) => [row.leadId, row]));

  const definitions: Array<{ key: SignalKey; id: string; label: string; detail: string }> = [
    { key: "buyerIntent", id: "buyer-intent", label: "Buying intent", detail: "Clients used language associated with pricing, quotations, payment, starting or subscribing." },
    { key: "priceConcern", id: "price-concern", label: "Price / affordability concern", detail: "Client messages contain explicit affordability, discount, budget or price-resistance language." },
    { key: "trustConcern", id: "trust-concern", label: "Trust / credibility concern", detail: "Client messages ask for authenticity, legitimacy, proof, registration, reviews or credibility." },
    { key: "timingConcern", id: "timing-concern", label: "Timing / not ready", detail: "Clients indicate that they want to wait, think about it or return later." },
    { key: "clientFrustration", id: "client-frustration", label: "Conversation frustration", detail: "Client messages suggest repetition, forgotten context, confusion or unanswered concerns." },
    { key: "repeatedAgentQuestion", id: "repeated-agent-question", label: "Repeated agent questions", detail: "The agent appears to have asked materially identical questions more than once in the same recent conversation." },
    { key: "repeatedAcknowledgement", id: "repeated-agent-ack", label: "Repeated stock acknowledgements", detail: "The agent repeatedly used the same acknowledgement opener in the same recent conversation." },
    { key: "unansweredClientQuestion", id: "unanswered-client-question", label: "Latest client question unanswered", detail: "The most recent client question has no later agent response in the stored inbox history." }
  ];

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const patterns: InboxPattern[] = definitions.map((definition) => {
    const affected = leadSignals.filter((row) => row.signals[definition.key]);
    return {
      key: definition.id,
      label: definition.label,
      count: affected.length,
      detail: definition.detail,
      sampleLeads: affected.slice(0, 5).map((row) => {
        const lead = leadById.get(row.leadId);
        return {
          id: row.leadId,
          name: lead?.name || null,
          phone: row.phone,
          status: String(lead?.status || ""),
          service: lead ? serviceForLead(lead) : null,
          excerpt: row.evidence[definition.key]?.[0] || row.latestClientExcerpt
        };
      })
    };
  }).sort((a, b) => b.count - a.count);

  return {
    analysedLeads: leadSignals.filter((row) => row.clientMessages + row.agentMessages > 0).length,
    analysedMessages: leadSignals.reduce((sum, row) => sum + row.clientMessages + row.agentMessages, 0),
    leadSignals,
    signalMap,
    patterns
  };
}
