export type AfricasTalkingSmsResult = {
  ok: boolean;
  status: string;
  messageId: string | null;
  cost: string | null;
  number: string;
  providerMessage: string | null;
};

export function normalizeSmsPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = `260${digits.slice(1)}`;
  if (!/^\d{8,15}$/.test(digits)) return null;
  return `+${digits}`;
}

export function africasTalkingSmsConfigured() {
  return Boolean(process.env.AFRICASTALKING_USERNAME?.trim() && process.env.AFRICASTALKING_API_KEY?.trim());
}

function endpoint() {
  return /^true|1|yes$/i.test(process.env.AFRICASTALKING_SANDBOX || "")
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
}

export async function sendAfricasTalkingSms(input: { to: string; message: string }): Promise<AfricasTalkingSmsResult> {
  const username = process.env.AFRICASTALKING_USERNAME?.trim();
  const apiKey = process.env.AFRICASTALKING_API_KEY?.trim();
  if (!username || !apiKey) throw new Error("Africa's Talking SMS is not configured.");
  const to = normalizeSmsPhone(input.to);
  if (!to) throw new Error("The client phone number is not valid for SMS delivery.");
  const message = input.message.trim();
  if (!message) throw new Error("SMS message cannot be empty.");
  if (message.length > 1200) throw new Error("SMS message is too long.");

  const body = new URLSearchParams({ username, to, message });
  const senderId = process.env.AFRICASTALKING_SENDER_ID?.trim();
  if (senderId) body.set("from", senderId);

  const response = await fetch(endpoint(), {
    method: "POST",
    headers: {
      apiKey,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    signal: AbortSignal.timeout(12000)
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(payload?.errorMessage || payload?.SMSMessageData?.Message || `Africa's Talking returned ${response.status}.`);

  const recipient = payload?.SMSMessageData?.Recipients?.[0] || {};
  const status = String(recipient.status || payload?.SMSMessageData?.Message || "submitted");
  const statusCode = Number(recipient.statusCode);
  const ok = Number.isFinite(statusCode) ? [100, 101, 102].includes(statusCode) : !/rejected|failed|invalid|insufficient|blacklist|riskhold/i.test(status);
  if (!ok) throw new Error(`Africa's Talking SMS was not accepted: ${status}${Number.isFinite(statusCode) ? ` (${statusCode})` : ""}.`);
  return {
    ok,
    status,
    messageId: recipient.messageId ? String(recipient.messageId) : null,
    cost: recipient.cost ? String(recipient.cost) : null,
    number: String(recipient.number || to),
    providerMessage: payload?.SMSMessageData?.Message ? String(payload.SMSMessageData.Message) : null
  };
}
