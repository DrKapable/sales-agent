const MIN_REPLY_TARGET_MS = 6000;
const MAX_REPLY_TARGET_MS = 15000;

export function humanReplyDelayMs(elapsedMs: number, randomValue = Math.random()) {
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  const targetMs = MIN_REPLY_TARGET_MS + Math.floor(boundedRandom * (MAX_REPLY_TARGET_MS - MIN_REPLY_TARGET_MS));
  return Math.max(0, targetMs - Math.max(0, elapsedMs));
}

export async function wait(milliseconds: number) {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

