import { describe, expect, it } from "vitest";
import { mayPerform } from "@/lib/internal-team-actions";
import { formatStaffSummary } from "@/lib/internal-team-proactive";
import type { TeamMember } from "@/lib/internal-team-registry";

const director:TeamMember={
  id:"director-test",name:"Director Example",phone:"260900000001",
  role:"director",active:true,dailyBriefEnabled:true,priorityAlertsEnabled:true
};
describe("confirmed team action permissions",()=>{
  it("reserves lead assignments for directors",()=>{
    expect(mayPerform("director","assign_lead")).toBe(true);
    expect(mayPerform("sales","assign_lead")).toBe(false);
    expect(mayPerform("support","assign_lead")).toBe(false);
    expect(mayPerform("marketing","assign_lead")).toBe(false);
  });
  it("permits delegated read-write activities without payments",()=>{
    expect(mayPerform("sales","update_lead")).toBe(true);
    expect(mayPerform("support","follow_up_client")).toBe(true);
    expect(mayPerform("marketing","update_lead")).toBe(false);
    expect(mayPerform("marketing","message_staff")).toBe(true);
    expect(mayPerform("marketing","progress_task")).toBe(true);
    expect(mayPerform("support","complete_task")).toBe(true);
  });
  it("does not permit unknown operation names",()=>{
    expect(mayPerform("director","delete_payment" as never)).toBe(false);
    expect(mayPerform("director","reset_sales" as never)).toBe(false);
    expect(mayPerform("sales","verify_payment" as never)).toBe(false);
  });
});
describe("proactive digest",()=>{
  it("includes scope and actual supplied KPI values",()=>{
    const output=formatStaffSummary(director,{scope:"whole organisation",newLeadsInPeriod:3,totalLeads:50,converted:7,hotOpenLeads:9,followUpsDue:2},["Verified yesterday: K500"]);
    expect(output).toContain("New enquiries yesterday: 3");
    expect(output).toContain("Current leads: 50; converted: 7");
    expect(output).toContain("Hot open: 9; follow-ups due: 2");
    expect(output).toContain("Verified yesterday: K500");
  });
  it("does not automatically include finance in marketing briefs",()=>{
    const marketing={...director,name:"Marketing Example",role:"marketing" as const};
    const output=formatStaffSummary(marketing,{scope:"whole organisation",totalLeads:4},[]);
    expect(output).not.toContain("Verified yesterday");
    expect(output).not.toContain("payment");
  });
});
