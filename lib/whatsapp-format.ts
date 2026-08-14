export function normalizeWhatsAppReply(text: string) {
  return text
    .replaceAll("—", ",")
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
}
