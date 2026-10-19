import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ leads: vi.fn(), conversation: vi.fn(), assigned: vi.fn() }));
vi.mock("@/lib/store", () => ({ listLeads: mocks.leads, getConversation: mocks.conversation }));
vi.mock("@/lib/client-documents", () => ({ listClientDocuments: mocks.assigned }));
import { GET } from "@/app/api/admin/conversation-documents/route";
import { clientAttachmentChatContent } from "@/lib/client-attachment-content";
import { documentDeliveryLabel } from "@/lib/conversation-documents";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  mocks.leads.mockResolvedValue([{ id: "lead1", phone: "260123456789", name: "Test client" }]);
  mocks.assigned.mockResolvedValue([]);
});

describe("incoming conversation files", () => {
  it("includes historic images, documents, voice and video once each, excluding assistant messages", async () => {
    const messages = ["image", "document", "audio", "video"].map((kind, index) => ({
      id: `msg${index}`, role: "user", createdAt: "2026-10-16T10:34:00Z",
      content: clientAttachmentChatContent({ kind: kind as "image", mediaId: `media${index}12345`, fileName: `${kind}.file`, mimeType: null, caption: null })
    }));
    mocks.conversation.mockResolvedValue([...messages, messages[0], { ...messages[0], role: "assistant" }]);
    const response = await GET(new Request("https://sales.medmindslc.online/api/admin/conversation-documents?phone=260123456789"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.documents).toHaveLength(4);
    expect(payload.documents.map((file: { title: string }) => file.title)).toEqual(["image.file", "document.file", "audio.file", "video.file"]);
    expect(payload.documents.every((file: { deliveryStatus: string; downloadUrl: string }) => file.deliveryStatus === "RECEIVED" && file.downloadUrl.startsWith("/api/admin/whatsapp-media/"))).toBe(true);
    expect(documentDeliveryLabel(payload.documents[0].deliveryStatus)).toBe("Received from client");
  });
});
