import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseIncomingMessages, verifyWhatsAppSignature } from "../lib/whatsapp";

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
});
