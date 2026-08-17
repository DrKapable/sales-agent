export type ResearchCampaignOpening = {
  reply: string;
  serviceInterest: string;
};

const OTHER_SERVICE = /\b(pa\s*gym|osce|exam prep|tutorial|software|website|web development|automation|cybersecurity|workforce|logbook)\b/i;
const VAGUE_AD_ENQUIRY = /\b(more\s+info(?:rmation)?|info\s+on\s+this|tell\s+me\s+more|details(?:\s+please)?|how\s+does\s+this\s+work|i(?:'|’)?.?m\s+interested|interested\s+in\s+this|saw\s+your\s+ad|seen\s+your\s+ad|about\s+this|what\s+is\s+this|can\s+i\s+get\s+more)\b/i;
const SHORT_PRICE_ENQUIRY = /\b(how\s+much|price|cost|fee|charges?)\b/i;

/**
 * Handles low-information opening messages from the active research campaigns.
 * The first response lowers threshold resistance: establish the client's route or
 * need before exposing a price or asking for a larger commitment.
 */
export function researchCampaignOpening(text: string, firstClientTurn: boolean): ResearchCampaignOpening | null {
  if (!firstClientTurn) return null;
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean || clean.length > 180 || OTHER_SERVICE.test(clean)) return null;

  if (SHORT_PRICE_ENQUIRY.test(clean) && clean.length <= 90) {
    return {
      serviceInterest: "Research enquiry",
      reply: "I can give you the correct fee once I know which option fits you. Are you looking to learn the proposal-writing process yourself, or do you want hands-on help with your actual proposal or dissertation?"
    };
  }

  if (!VAGUE_AD_ENQUIRY.test(clean)) return null;

  return {
    serviceInterest: "Research enquiry",
    reply: "Absolutely. MedMinds can either support your actual research work or teach you the proposal-writing process so you can do it yourself. What are you working on right now: a proposal, dissertation, or data analysis?"
  };
}
