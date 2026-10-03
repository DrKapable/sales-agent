import { createHmac } from "node:crypto";

type DeliveryReceipt = { id: string; status: string };

// Relay only delivery IDs and states. Guest phone numbers, chat content and
// attachments stay with the existing Sales webhook.
export async function forwardWalimaDeliveryReceipts(receipts: DeliveryReceipt[]) {
  if (process.env.WALIMA_DELIVERY_FORWARDING_ENABLED !== "true") return;
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return;
  const statuses = receipts
    .filter((receipt) => ["sent", "delivered", "read", "failed"].includes(receipt.status))
    .map(({ id, status }) => ({ id, status }));
  if (!statuses.length) return;
  const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses } }] }] });
  const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch("https://juma-zabibu.medmindslc.online/api/whatsapp/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hub-signature-256": signature },
        body,
        signal: AbortSignal.timeout(3000),
        redirect: "error",
      });
      if (response.ok) return;
      // Authentication/configuration failures require intervention, not retries.
      if (response.status >= 400 && response.status < 500) break;
    } catch {
      // Receipt updates are idempotent, so retrying is safe.
    }
  }
  console.warn("Walima delivery status forwarding failed");
}