const LEGACY_MIN_REPLY_TARGET_MS = 6000;
const LEGACY_MAX_REPLY_TARGET_MS = 15000;
const MIN_TYPING_DELAY_MS = 2500;
const MAX_TYPING_DELAY_MS = 18000;
const MS_PER_CHARACTER = 30;

// The live webhook now calls this with one argument, which disables the old
// random fixed-window delay. A supplied random value retains the historical
// deterministic behaviour used by the timing regression tests.
export function humanReplyDelayMs(elapsedMs: number, randomValue?: number) {
  if (randomValue === undefined) return 0;
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  const targetMs = LEGACY_MIN_REPLY_TARGET_MS + Math.floor(boundedRandom * (LEGACY_MAX_REPLY_TARGET_MS - LEGACY_MIN_REPLY_TARGET_MS));
  return Math.max(0, targetMs - Math.max(0, elapsedMs));
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
