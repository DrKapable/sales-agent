const LEGACY_MIN_REPLY_TARGET_MS = 6000;
const LEGACY_MAX_REPLY_TARGET_MS = 15000;
const MIN_REPLY_TARGET_MS = 15000;
const MAX_REPLY_TARGET_MS = 120000;
const CHARACTERS_TO_MAX_DELAY = 800;
const MIN_TYPING_DELAY_MS = 2500;
const MAX_TYPING_DELAY_MS = 18000;
const MS_PER_CHARACTER = 30;

// Retained for older deterministic tests and any legacy callers.
export function humanReplyDelayMs(elapsedMs: number, randomValue?: number) {
  if (randomValue === undefined) return 0;
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  const targetMs = LEGACY_MIN_REPLY_TARGET_MS + Math.floor(boundedRandom * (LEGACY_MAX_REPLY_TARGET_MS - LEGACY_MIN_REPLY_TARGET_MS));
  return Math.max(0, targetMs - Math.max(0, elapsedMs));
}

// Mary's live WhatsApp response delay. Short replies target roughly 15-30 seconds,
// medium replies roughly 30-75 seconds, and long replies roughly 1-2 minutes.
// Time already spent generating the response counts toward the target so the
// client experiences a natural total response time rather than stacked delays.
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

export function humanTextTypingDelayMs(text: string, randomValue = Math.random()) {
  const length = text.trim().length;
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  const jitter = 0.9 + boundedRandom * 0.2;
  const estimatedMs = (MIN_TYPING_DELAY_MS + length * MS_PER_CHARACTER) * jitter;
  return Math.round(Math.min(MAX_TYPING_DELAY_MS, Math.max(MIN_TYPING_DELAY_MS, estimatedMs)));
}

export async function wait(milliseconds: number) {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
