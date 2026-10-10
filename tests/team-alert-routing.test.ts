import { beforeEach, describe, expect, it, vi } from "vitest";
const { sendStaffAlert } = vi.hoisted(() => ({ sendStaffAlert: vi.fn().mockResolvedValue({ messageId: "accepted" }) }));
vi.mock("@/lib/team-alert-transport", () => ({ sendStaffAlert }));
import { sendTeamCopies, sendTeamNotification, sendSalesPipelineCopies } from "../lib/team-notifications";
import { referralRecipients } from "../lib/referrals";
import { staffNames } from "../lib/team-directory";

describe("director alert routing", () => {
  beforeEach(() => sendStaffAlert.mockClear());
  it("copies the director once even when default copies are disabled", async () => {
    await sendTeamCopies({ heading: "Marketing referral", body: "A client wants advertising help.", primary: referralRecipients.conrad, includeDefaultCc: false });
    expect(sendStaffAlert.mock.calls.map(([input]) => input.phone)).toEqual(["260979235018", "260977259132"]);
  });
  it("includes the director on new and hot client alerts", async () => {
    await sendTeamNotification({ kind: "new_client", body: "New client details" });
    await sendSalesPipelineCopies({ heading: "Hot client", body: "Hot client details" });
    expect(sendStaffAlert.mock.calls.filter(([input]) => input.phone === "260977259132")).toHaveLength(2);
  });
  it("does not duplicate the director when he is the primary recipient", async () => {
    await sendTeamCopies({ heading: "Daily summary", body: "Today's totals", primary: referralRecipients.mustafa, cc: [referralRecipients.mustafa] });
    expect(sendStaffAlert.mock.calls.filter(([input]) => input.phone === "260977259132")).toHaveLength(1);
  });
  it("removes Monica and Counsel Chisha from selectable staff and phone routes", () => {
    expect(staffNames).not.toContain("Dr. Monica");
    expect(staffNames).not.toContain("Counsel Chisha Chomba");
    expect(Object.values(referralRecipients).map((recipient) => recipient.phone)).not.toContain("260968441133");
    expect(Object.values(referralRecipients).map((recipient) => recipient.phone)).not.toContain("260970623913");
  });
});
