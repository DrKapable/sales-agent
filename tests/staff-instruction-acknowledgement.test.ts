import { describe, expect, it } from "vitest";
import { staffInstructionReference, staffInstructionFooter, parseStaffStatusReply } from "@/lib/internal-team-correspondence";
import { staffMessagePreview } from "@/lib/internal-team-actions";

const actionId = "a1b2c3d4-1111-4abc-8def-123456789012";
const ref = "MM-A1B2C3D4";

describe("staff instruction reference", () => {
  it("derives a consistent reference from a confirmed action", () => {
    expect(staffInstructionReference(actionId)).toBe(ref);
    expect(() => staffInstructionReference("bad-id")).toThrow();
  });
  it("shows the same acknowledgement instructions in the message preview", () => {
    const footer=staffInstructionFooter(actionId);
    const body="Please address the MedMinds inbox issue and report progress.";
    const preview=staffMessagePreview("Dr. Juma","Dr Kanyembo Ng'andwe",body+"\n\n"+footer);
    expect(preview).toContain("Please address the MedMinds inbox issue");
    expect(preview).toContain("ACK "+ref);
    expect(preview).toContain("WORKING "+ref);
    expect(preview).toContain("DONE "+ref);
    expect(preview).toContain("not verification of client resolution");
  });
  it.each([
    ["ACK MM-A1B2C3D4","ACK"],
    ["working mm-a1b2c3d4","WORKING"],
    ["DONE MM-A1B2C3D4!","DONE"],
    ["done MM-A1B2C3D4.","DONE"]
  ])("parses explicit %s status reliably", (input, expected) => {
    expect(parseStaffStatusReply(input)).toEqual({state:expected,code:"A1B2C3D4"});
  });
  it.each([
    "Okay thanks",
    "I fixed the issue yesterday",
    "DONE MM-",
    "DONE MM-A1B2C3D4 to confirm",
    "CONFIRM A1B2C3D4",
    "DONE MM-ABCDEFGH",
    "ACK MM-A1B2C3D"
  ])("refuses to infer acknowledgement from arbitrary staff chat %s", (input) => {
    expect(parseStaffStatusReply(input)).toBeNull();
  });
});
