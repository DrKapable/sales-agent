import { describe, expect, it } from "vitest";
import { isManagementCatchUpRequest, formatManagementCatchUp } from "@/lib/internal-team-catchup";
import type { TeamMember } from "@/lib/internal-team-registry";

const director: TeamMember = {
  id: "sample", name: "Dr. Mustafa Juma Phiri", phone: "260977259132",
  role: "director", active: true, dailyBriefEnabled: true, priorityAlertsEnabled: true
};
const sales: TeamMember = { ...director, id: "sales", name: "Sales Representative", role: "sales" };
const marketing: TeamMember = { ...director, id: "marketing", name: "Marketing Representative", role: "marketing" };
const now = new Date("2026-10-16T19:04:00Z");

describe("Mary management catch-up intent detection", () => {
  it.each([
    "What did I miss?",
    "Mary, what did I miss?",
    "What needs attention?",
    "What have I missed today?",
    "Any updates?",
    "Give me a business update",
    "Give me the daily brief",
    "Catch me up",
    "What changed overnight?"
  ])("routes %s directly to live reporting", (input) => {
    expect(isManagementCatchUpRequest(input)).toBe(true);
  });
  it.each([
    "Assign this client to Conrad",
    "Update the lead status",
    "Send Zabibu a message",
    "Mark this task completed",
    "Confirm 12345678"
  ])("does not accidentally intercept action command %s", (input) => {
    expect(isManagementCatchUpRequest(input)).toBe(false);
  });
});

describe("Mary management brief factual rendering", () => {
  const overview = {
    scope: "whole organisation", newLeadsInPeriod: 4, totalLeads: 85,
    converted: 12, hotOpenLeads: 7, followUpsDue: 3
  };
  const attention = {
    leads: {clients:[
      {name:"Example Client",phone:"260999123456",status:"FOLLOW-UP REQUIRED"},
      {name:"Second Client",phone:"260999123457",status:"PAYMENT PENDING"}
    ]},
    openTasks:[{id:"task1",title:"Call back buyer",overdue:true},{id:"task2",title:"Review quotation",overdue:false}]
  };
  it("reports grounded figures and labels the priority list as a sample", () => {
    const text = formatManagementCatchUp(director,{
      overview,attention,
      finance:{summary:{verifiedAmountZmw:1250,verifiedPayments:3,pendingPayments:2,pendingAmountZmw:400}}
    }, "today", now);
    expect(text).toContain("Dr. Juma");
    expect(text).toContain("16 Oct 2026");
    expect(text).toContain("New leads (today): 4");
    expect(text).toContain("Current total: 85");
    expect(text).toContain("HOT leads: 7");
    expect(text).toContain("K1,250.00");
    expect(text).toContain("Example Client");
    expect(text).toContain("Overdue: Call back buyer");
    expect(text).toContain("limited sample");
  });
  it("never shows director finance fields to sales members", () => {
    const text = formatManagementCatchUp(sales,{
      overview:{...overview,scope:"leads assigned to Sales Representative"},
      attention,
      finance:{summary:{verifiedAmountZmw:999999,verifiedPayments:50,pendingPayments:99}}
    },"today",now);
    expect(text).not.toContain("999999");
    expect(text).not.toContain("payments");
    expect(text).toContain("Example Client");
  });
  it("keeps client details away from marketing and gives trends", () => {
    const text=formatManagementCatchUp(marketing,{
      overview:{...overview,scope:"whole organisation"},
      attention,
      marketing:{categories:[{service:"Research Support",enquiries:10}]}
    },"today",now);
    expect(text).toContain("Research Support");
    expect(text).not.toContain("Example Client");
    expect(text).not.toContain("Verified payments");
  });
  it("uses good sections when another source fails without inventing missing payments", () => {
    const text=formatManagementCatchUp(director,{overview,attention,unavailable:["payment records"]},"today",now);
    expect(text).toContain("New leads (today): 4");
    expect(text).toContain("Not available right now: payment records");
    expect(text).not.toContain("Verified payments (today): K0");
  });
  it("does not invent totals when all live sections fail", () => {
    const text=formatManagementCatchUp(director,{unavailable:["sales overview","payment records","operational priorities"]},"today",now);
    expect(text).toContain("couldn't obtain any verified live Sales figures");
    expect(text).not.toContain("New leads (today): 0");
  });
});
