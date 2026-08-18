import { describe, expect, it } from "vitest";
import { assessLeadQualification, buildQualificationReply } from "@/lib/lead-qualification";
import type { Lead } from "@/lib/types";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    phone: "260977000000",
    name: "Client",
    email: null,
    institution: null,
    programme: null,
    serviceInterest: null,
    deadline: null,
    packageName: null,
    status: "NEW LEAD",
    handoffReason: null,
    aiPaused: false,
    assignedTo: null,
    internalNote: null,
    priority: "STANDARD",
    followUpAt: null,
    source: "whatsapp",
    createdAt: "2026-08-17T10:00:00.000Z",
    updatedAt: "2026-08-17T10:00:00.000Z",
    ...overrides
  };
}

const user = (content: string) => ({ role: "user" as const, content });
const assistant = (content: string) => ({ role: "assistant" as const, content });

describe("lead qualification before pricing", () => {
  it("blocks a price-only opener and asks for the need first", () => {
    const result = assessLeadQualification({ lead: lead(), history: [user("How much?")], latestText: "How much?" });
    expect(result.commercialIntent).toBe(true);
    expect(result.qualified).toBe(false);
    expect(result.missing).toBe("need");
    expect(buildQualificationReply(result)).not.toMatch(/K\s?\d|ZMW\s?\d/i);
  });

  it("qualifies research sequentially by need, level and deadline", () => {
    const incomplete = assessLeadQualification({
      lead: lead({ serviceInterest: "Research support" }),
      history: [user("I need help with my dissertation data analysis"), user("How much?")],
      latestText: "How much?"
    });
    expect(incomplete.missing).toBe("programme");

    const almost = assessLeadQualification({
      lead: lead({ serviceInterest: "Research support", programme: "MPH" }),
      history: [user("I need help with my dissertation data analysis"), user("I am doing an MPH"), user("How much?")],
      latestText: "How much?"
    });
    expect(almost.missing).toBe("deadline");
    expect(buildQualificationReply(almost)).toBe("What deadline are you working toward?");
    expect(buildQualificationReply(almost)).not.toMatch(/that helps/i);

    const complete = assessLeadQualification({
      lead: lead({ serviceInterest: "Research support", programme: "MPH", deadline: "30 August 2026" }),
      history: [user("I need help with my dissertation data analysis"), user("How much?")],
      latestText: "How much?"
    });
    expect(complete.qualified).toBe(true);
  });

  it("lets the client's latest self-directed preference override an earlier hands-on enquiry", () => {
    const result = assessLeadQualification({
      lead: lead({ serviceInterest: "Research support", programme: "Master's/Postgraduate" }),
      history: [
        user("I need help with my proposal"),
        user("Actually I have already started and I want to write it myself"),
        user("What are your fees?")
      ],
      latestText: "What are your fees?"
    });
    expect(result.kind).toBe("course");
    expect(result.qualified).toBe(true);
  });

  it("requires Pa Gym fit before pricing", () => {
    const result = assessLeadQualification({
      lead: lead({ serviceInterest: "Pa Gym", programme: "MBChB" }),
      history: [user("How much is Pa Gym?")],
      latestText: "How much is Pa Gym?"
    });
    expect(result.qualified).toBe(false);
    expect(result.missing).toBe("format");
  });

  it("allows price objection handling when a price was already quoted", () => {
    const result = assessLeadQualification({
      lead: lead({ serviceInterest: "Research support", status: "INTERESTED" }),
      history: [assistant("The approved fee is K1,200."), user("That is too expensive")],
      latestText: "That is too expensive"
    });
    expect(result.priorPriceContext).toBe(true);
  });
});
