import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "@/components/admin-dashboard";
import { clientAttachmentChatContent, parseClientAttachmentChatContent } from "@/lib/client-attachment-content";
import type { ConversationMessage } from "@/lib/types";

const screenshotContent = '[CLIENT_ATTACHMENT] {"kind":"image","mediaId":"4728232384111255","fileName":"image-84111255.jpg","mimeType":"image/jpeg","caption":null}';
function render(content: string, role: ConversationMessage["role"] = "user") {
  return renderToStaticMarkup(<MessageBubble message={{ id: "attachment-test", externalId: null, phone: "260000000000", role, content, createdAt: "2026-10-16T10:34:00Z" }} />);
}

describe("native conversation attachment rendering", () => {
  it("renders the reported historic image immediately without exposing internal payload text", () => {
    const markup = render(screenshotContent);
    expect(markup).toContain('<img src="/api/admin/whatsapp-media/4728232384111255?filename=image-84111255.jpg"');
    expect(markup).toContain('aria-label="Open image image-84111255.jpg"');
    expect(markup).toContain("download=1");
    expect(markup).not.toContain("[CLIENT_ATTACHMENT]");
    expect(markup).not.toContain("mediaId");
    expect(markup).toContain("timelineRow client");
  });

  it.each(["document", "audio", "video"] as const)("renders %s controls and encoded safe links", (kind) => {
    const markup = render(clientAttachmentChatContent({ kind, mediaId: "media12345", fileName: 'client file & notes.pdf', mimeType: null, caption: '<script>alert(1)</script> *important*' }));
    expect(markup).toContain("filename=client+file+%26+notes.pdf");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain("[CLIENT_ATTACHMENT]");
    if (kind !== "document") {
      expect(markup).toContain(`<${kind}`);
      expect(markup).toContain('preload="none"');
      expect(markup).toContain('controls=""');
    }
  });

  it("keeps plain client and human replies intact", () => {
    expect(render("Please review this", "user")).toContain("<p>Please review this</p>");
    expect(render("[Human: Juma] Reviewed", "assistant")).toContain("<p>Reviewed</p>");
  });

  it("accepts legacy whitespace and delivery markers without altering captions", () => {
    expect(parseClientAttachmentChatContent(screenshotContent.replace("] ", "]\n"))?.mediaId).toBe("4728232384111255");
    expect(parseClientAttachmentChatContent(` ${screenshotContent}\u2063\u2060\u2063`)?.kind).toBe("image");
    expect(parseClientAttachmentChatContent('[CLIENT_ATTACHMENT] {"kind":"image","mediaId":"../private"}')).toBeNull();
    expect(parseClientAttachmentChatContent('[CLIENT_ATTACHMENT] {bad json}')).toBeNull();
  });
});
