import { beforeEach, describe, expect, it, vi } from "vitest";
const { sendStaffAlert, generate, agents } = vi.hoisted(() => ({ sendStaffAlert: vi.fn().mockResolvedValue({ messageId: "mock" }), generate: vi.fn(), agents: [] as any[] }));
vi.mock("@/lib/team-alert-transport", () => ({ sendStaffAlert }));
vi.mock("@/lib/business-notifications", () => ({ maybeNotifyHotLead: vi.fn().mockResolvedValue(undefined), notifyBusinessEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("ai", () => ({ gateway: vi.fn(), tool: (definition: any) => definition, ToolLoopAgent: class { constructor(config: any) { agents.push(config); } generate = generate; } }));
import { addMessage, getConversation, getOrCreateLead, updateLead } from "@/lib/store";
import { maybePrepareHotLeadHandoff, prepareSpecialistHandoff, SPECIALIST_HANDOFF_MESSAGE, shouldHandoffHotLead } from "@/lib/specialist-handoff";
import { sendTeamCopies } from "@/lib/team-notifications";
import { replyToClient } from "@/lib/ai/sales-agent";
import { optimizeInboundLead } from "@/lib/conversation-optimization";

let phone: string;
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  phone = `26097${Math.floor(Math.random() * 10000000).toString().padStart(7, "0")}`;
  sendStaffAlert.mockClear(); generate.mockReset(); agents.length = 0;
});

describe("dedicated specialist handoff", () => {
  it("uses the exact client message for an existing HOT tag and alerts all four humans once", async () => {
    await updateLead(phone, { name: "Chipo Harriet", priority: "HOT", serviceInterest: "EMKP project proposal", deadline: "This week" });
    const result = await maybePrepareHotLeadHandoff(phone, "My proposal is active and I can pay", "whatsapp");
    expect(result?.reply).toBe(SPECIALIST_HANDOFF_MESSAGE);
    expect(result?.referralNotification?.body).toContain("Chipo Harriet");
    expect(result?.referralNotification?.body).toContain("This week");
    expect(result?.referralNotification?.phone).toBe("260974634555");
    expect(sendStaffAlert).not.toHaveBeenCalled(); // Delivery is the transport's next action, after the client response.
    await sendTeamCopies({ heading: result!.referralNotification!.heading!, body: result!.referralNotification!.body, primary: { name: result!.referralNotification!.recipientName, phone: result!.referralNotification!.phone } });
    expect(sendStaffAlert.mock.calls.map(([input]) => input.phone).sort()).toEqual(["260974634555", "260975352801", "260977259132", "260979235018"]);
    expect(await maybePrepareHotLeadHandoff(phone, "Any update?", "whatsapp")).toBeNull();
    expect((await getConversation(phone)).filter((message) => message.content === SPECIALIST_HANDOFF_MESSAGE)).toHaveLength(1);
  });

  it("does not interrupt converted, lost, warm or explicitly paused clients", () => {
    for (const status of ["CONVERTED", "LOST LEAD"] as const) expect(shouldHandoffHotLead({ priority: "HOT", status, aiPaused: false })).toBe(false);
    expect(shouldHandoffHotLead({ priority: "WARM", status: "INTERESTED", aiPaused: false })).toBe(false);
    expect(shouldHandoffHotLead({ priority: "HOT", status: "INTERESTED", aiPaused: true })).toBe(false);
  });

  it("does not label a quotation enquiry HOT without all four qualifying facts", async () => {
    await updateLead(phone, { serviceInterest: "Research support" });
    const result = await optimizeInboundLead(phone, "Can you send me a quotation?", "whatsapp");
    expect(result.lead.priority).toBe("WARM");
    expect(result.analysis.closerAttention).toBe(true);
  });

  it("replaces model wording with the exact handoff for an unanswerable custom question", async () => {
    await addMessage(phone, "user", "Can you design my custom statistical model?");
    generate.mockImplementation(async () => {
      await agents.at(-1).tools.requestHumanAssistance.execute({ trigger: "complex_custom", referralType: "research_specialist", reason: "Custom methodology needs specialist review", summary: "Client needs advice on a custom statistical model." });
      return { text: "A specialist might help with that." };
    });
    const result = await replyToClient(phone, "Can you design my custom statistical model?", "whatsapp");
    expect(result.reply).toBe(SPECIALIST_HANDOFF_MESSAGE);
    expect(result.referralNotification?.body).toContain("Complex custom question Mary cannot answer");
    expect((await getOrCreateLead(phone, "whatsapp")).assignedTo).toBe("Dr Kanyembo Ng'andwe");
  });

  it("tags HOT from the four evidence fields and sends the required handoff", async () => {
    generate.mockImplementation(async () => {
      const tool = agents.at(-1).tools.tagHotLead;
      expect(tool.inputSchema.safeParse({ highNeedEvidence: "Needs help" }).success).toBe(false);
      await tool.execute({ highNeedEvidence: "Client cannot complete their proposal", highUrgencyEvidence: "Submission tomorrow", abilityToPayEvidence: "Client can pay the approved fee today", activeProjectEvidence: "Proposal already in progress" });
      return { text: "We will follow up." };
    });
    const result = await replyToClient(phone, "My proposal is in progress, due tomorrow; I need help and can pay today", "whatsapp");
    expect(result.reply).toBe(SPECIALIST_HANDOFF_MESSAGE);
    expect((await getOrCreateLead(phone, "whatsapp")).priority).toBe("HOT");
    expect(result.referralNotification?.body).toContain("Submission tomorrow");
  });

  it("does not queue another alert for a repeated complex handoff", async () => {
    const first = await prepareSpecialistHandoff({ phone, source: "whatsapp", trigger: "complex_custom", latestText: "Custom analysis" });
    await addMessage(phone, "assistant", first!.reply);
    generate.mockImplementation(async () => {
      const output = await agents.at(-1).tools.requestHumanAssistance.execute({ trigger: "complex_custom", referralType: "research_specialist", reason: "Still needs review", summary: "Same custom analysis question" });
      expect(output.queued).toBe(false);
      return { text: "Your question is already with the specialist team." };
    });
    const result = await replyToClient(phone, "Any update?", "whatsapp");
    expect(result.referralNotification).toBeNull();
    expect(result.reply).not.toBe(SPECIALIST_HANDOFF_MESSAGE);
  });

  it("keeps routine sales replies and avoids real-team alerts for simulator sessions", async () => {
    generate.mockResolvedValue({ text: "Our service includes editing and formatting." });
    expect((await replyToClient(phone, "What is included?", "whatsapp")).reply).toBe("Our service includes editing and formatting.");
    const result = await prepareSpecialistHandoff({ phone: `sim-${crypto.randomUUID()}`, source: "simulator", trigger: "complex_custom", latestText: "A custom question" });
    expect(result?.referralNotification).toBeNull();
  });
});
