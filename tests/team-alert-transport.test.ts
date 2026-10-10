import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getConversation: vi.fn(), inventory: vi.fn(), template: vi.fn(), text: vi.fn(), accepted: vi.fn() }));
vi.mock("@/lib/store", () => ({ getConversation: mocks.getConversation }));
vi.mock("@/lib/meta-templates", () => ({ getApprovedMetaTemplateInventory: mocks.inventory, sendApprovedMetaTemplate: mocks.template }));
vi.mock("@/lib/message-delivery", () => ({ recordOutgoingMessageAccepted: mocks.accepted }));
vi.mock("@/lib/whatsapp", () => ({ sendWhatsAppText: mocks.text, sanitizeWhatsAppApiError: vi.fn() }));
import { sendStaffAlert, STAFF_NOTIFICATION_TEMPLATE } from "../lib/team-alert-transport";
const input = { phone: "260977259132", name: "Dr. Mustafa Juma Phiri", heading: "Daily summary", body: "New clients: 3\nHot clients: 2" };
beforeEach(() => { vi.clearAllMocks(); mocks.accepted.mockResolvedValue(undefined); mocks.template.mockResolvedValue({ messageId: "template-accepted" }); mocks.text.mockResolvedValue({ messageId: "text-accepted" }); mocks.inventory.mockResolvedValue({ templates: [{ name: STAFF_NOTIFICATION_TEMPLATE, language: "en_US" }] }); });
describe("staff WhatsApp alert transport", () => {
  it("sends full session text only after a recent inbound message", async () => {
    mocks.getConversation.mockResolvedValue([{ role: "user", createdAt: new Date().toISOString() }]);
    await sendStaffAlert(input);
    expect(mocks.text).toHaveBeenCalledWith(input.phone, expect.stringContaining(input.body), undefined);
    expect(mocks.template).not.toHaveBeenCalled();
  });
  it("uses the approved notification template outside the staff session", async () => {
    mocks.getConversation.mockResolvedValue([{ role: "user", createdAt: "2020-01-01T00:00:00Z" }]);
    await sendStaffAlert(input);
    expect(mocks.text).not.toHaveBeenCalled();
    expect(mocks.template).toHaveBeenCalledWith(expect.objectContaining({ phone: input.phone, name: STAFF_NOTIFICATION_TEMPLATE }));
    expect(mocks.template.mock.calls[0][0].components[0].parameters[2].text).toContain("New clients: 3 Hot clients: 2");
  });
  it("keeps every detail of a long daily summary by splitting template messages", async () => {
    mocks.getConversation.mockResolvedValue([]);
    const body = "a".repeat(1900);
    await sendStaffAlert({ ...input, body });
    expect(mocks.template).toHaveBeenCalledTimes(3);
    expect(mocks.template.mock.calls.map(([call]) => call.components[0].parameters[2].text).join("")).toBe(body);
  });
  it("reports approval required instead of claiming that an undeliverable alert was sent", async () => {
    mocks.getConversation.mockResolvedValue([]); mocks.inventory.mockResolvedValue({ templates: [] });
    await expect(sendStaffAlert(input)).rejects.toThrow("requires Meta approval");
    expect(mocks.text).not.toHaveBeenCalled(); expect(mocks.accepted).not.toHaveBeenCalled();
  });
});
