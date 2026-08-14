import { SALES_AGENT_PROMPT as BASE_SALES_AGENT_PROMPT } from "./prompt";

// Correct the public-facing agent surname without duplicating the full prompt.
// The relative import above deliberately bypasses the tsconfig alias used by callers.
export const SALES_AGENT_PROMPT = BASE_SALES_AGENT_PROMPT.replaceAll("Mary Kainda", "Mary Kaunda").replaceAll("Kainda", "Kaunda");
