import type { ConversationMessage } from "@/lib/types";

export const WHATSAPP_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function replyWindow(messages: ConversationMessage[], now = Date.now()) {
  const latestClientMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!latestClientMessage) return { open: false, expiresAt: null };
  const expiresAt = new Date(latestClientMessage.createdAt).getTime() + WHATSAPP_REPLY_WINDOW_MS;
  return { open: expiresAt > now, expiresAt: new Date(expiresAt).toISOString() };
}

export function humanMessageContent(sender: string, text: string) {
  return `[Human: ${sender}] ${text.trim()}`;
}

