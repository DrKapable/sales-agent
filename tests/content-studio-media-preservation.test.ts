import { afterEach, describe, expect, it } from "vitest";
import { deleteContentPost, getContentPost, saveContentPost } from "@/lib/content-studio";

const postId = "11111111-1111-4111-8111-111111111111";

describe("Content Studio creative preservation", () => {
  afterEach(async () => {
    await deleteContentPost(postId);
  });

  it("keeps a generated creative attached when a status-only save approves the post", async () => {
    await saveContentPost({
      id: postId,
      title: "MedMinds Prep revision",
      contentType: "MedMinds Prep / exam preparation",
      body: "Revise with structured question practice.",
      status: "DRAFT",
      mediaUrl: "https://sales.medmindslc.online/api/content/creative/example?v=2",
      creativeGeneratedAt: "2026-09-13T18:00:00.000Z",
      creativeVersion: 2,
      creativeHeadline: "REVISE WITH PURPOSE"
    });

    await saveContentPost({
      id: postId,
      title: "MedMinds Prep revision",
      contentType: "MedMinds Prep / exam preparation",
      body: "Revise with structured question practice.",
      status: "APPROVED",
      approvedBy: "MedMinds Admin"
    });

    const saved = await getContentPost(postId);
    expect(saved?.status).toBe("APPROVED");
    expect(saved?.mediaUrl).toBe("https://sales.medmindslc.online/api/content/creative/example?v=2");
    expect(saved?.creativeGeneratedAt).toBe("2026-09-13T18:00:00.000Z");
    expect(saved?.creativeVersion).toBe(2);
  });
});
