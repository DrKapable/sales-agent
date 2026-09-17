const LEGACY_MIN_REPLY_TARGET_MS = 6000;
const LEGACY_MAX_REPLY_TARGET_MS = 15000;
const MIN_REPLY_TARGET_MS = 8000;
const MAX_REPLY_TARGET_MS = 30000;
const CHARACTERS_TO_MAX_DELAY = 600;

// Retained for older deterministic tests and any legacy callers.
export function humanReplyDelayMs(elapsedMs: number, randomValue?: number) {
  if (randomValue === undefined) return 0;
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  const targetMs = LEGACY_MIN_REPLY_TARGET_MS + Math.floor(boundedRandom * (LEGACY_MAX_REPLY_TARGET_MS - LEGACY_MIN_REPLY_TARGET_MS));
  return Math.max(0, targetMs - Math.max(0, elapsedMs));
}

// Mary's live WhatsApp cadence should feel human without making the agent appear offline.
// Short replies target roughly 8-15 seconds, medium replies roughly 15-25 seconds,
// and long replies are capped at about 30 seconds.
export function humanTextReplyDelayMs(text: string, elapsedMs = 0, randomValue = Math.random()) {
  const length = text.trim().replace(/\s+/g, " ").length;
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  const lengthRatio = Math.min(1, length / CHARACTERS_TO_MAX_DELAY);
  const easedLength = Math.pow(lengthRatio, 0.85);
  const baseTargetMs = MIN_REPLY_TARGET_MS + easedLength * (MAX_REPLY_TARGET_MS - MIN_REPLY_TARGET_MS);
  const jitter = 0.95 + boundedRandom * 0.1;
  const targetMs = Math.min(MAX_REPLY_TARGET_MS, Math.max(MIN_REPLY_TARGET_MS, baseTargetMs * jitter));
  return Math.max(0, Math.round(targetMs - Math.max(0, elapsedMs)));
}

// Existing WhatsApp send code calls this immediately before Mary's message is sent.
// Keep that integration point but cap the visible typing delay so live chats stay responsive.
export function humanTextTypingDelayMs(text: string, randomValue = Math.random()) {
  return humanTextReplyDelayMs(text, 0, randomValue);
}

export async function wait(milliseconds: number) {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
