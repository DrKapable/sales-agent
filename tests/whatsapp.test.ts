import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseIncomingMessages, sanitizeWhatsAppApiError, sendWhatsAppText, verifyWhatsAppSignature } from "../lib/whatsapp";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("WhatsApp webhook security", () => {
  it("accepts only a valid HMAC signature", () => {
    const body = JSON.stringify({ object: "whatsapp_business_account" });
    const secret = "test-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyWhatsAppSignature(body, signature, secret)).toBe(true);
    expect(verifyWhatsAppSignature(body + "x", signature, secret)).toBe(false);
    expect(verifyWhatsAppSignature(body, null, secret)).toBe(false);
  });

  it("extracts supported text messages and ignores other events", () => {
    const messages = parseIncomingMessages({ entry: [{ changes: [{ value: { contacts: [{ profile: { name: "Amina" } }], messages: [{ id: "wamid.1", from: "260970000000", type: "text", text: { body: "  Hi  " } }, { id: "wamid.2", from: "260970000000", type: "image" }] } }] }] });
    expect(messages).toEqual([{ id: "wamid.1", phone: "260970000000", name: "Amina", text: "Hi" }]);
  });

  it("keeps useful Meta error fields while redacting sensitive values", () => {
    const error = sanitizeWhatsAppApiError(JSON.stringify({
      error: {
        message: "Recipient +260977259132 cannot be reached with Bearer secret-token",
        type: "OAuthException",
        code: 131030,
        error_subcode: 2494010,
        error_data: { details: "Phone 260977259132 is not permitted" },
        fbtrace_id: "A1b2C3"
      }
    }));

    expect(error).toEqual({
      code: 131030,
      subcode: 2494010,
      type: "OAuthException",
      message: "Recipient [REDACTED_NUMBER] cannot be reached with Bearer [REDACTED]",
      details: "Phone [REDACTED_NUMBER] is not permitted",
      traceId: "A1b2C3"
    });
  });

  it("returns Meta's accepted outgoing message ID", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1277782185417553");
    vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v25.0");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      contacts: [{ wa_id: "260970000000" }],
      messages: [{ id: "wamid.outgoing" }]
    }), { status: 200 })));

    await expect(sendWhatsAppText("260970000000", "Hello")).resolves.toEqual({
      messageId: "wamid.outgoing",
      waId: "260970000000"
    });
  });
});
