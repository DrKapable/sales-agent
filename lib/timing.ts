const MIN_TYPING_DELAY_MS = 2500;
const MAX_TYPING_DELAY_MS = 18000;
const MS_PER_CHARACTER = 30;

// Kept for backwards compatibility with the webhook. The actual human-like
// delay is now applied when the final outbound text is known, so response
// timing can scale with the length of Mary's message.
export function humanReplyDelayMs(_elapsedMs: number) {
  return 0;
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
