import { getConversation, listOffers } from "@/lib/store";

function money(value: number) {
  return `K${Math.round(value).toLocaleString("en-US")}`;
}

function firstUrl(text: string | null | undefined) {
  const match = text?.match(/https?:\/\/[^\s)]+/);
  return match?.[0]?.replace(/[.,;]+$/, "") || null;
}

export async function verifiedConversationFallback(phone: string, text: string) {
  const message = text.trim();
  const lower = message.toLowerCase();
  const history = await getConversation(phone, 14).catch(() => []);
  const recentContext = history.map((item) => item.content).join(" ").toLowerCase();
  const lastAssistant = [...history].reverse().find((item) => item.role === "assistant")?.content.toLowerCase() || "";

  if (/^(hi|hello|hey|hello\?|hey\?|\?)[.! ]*$/i.test(message)) {
    return "Hi 👋 I’m here. What would you like help with?";
  }
  if (/^(thanks|thank you|alright|okay|ok)[.! ]*$/i.test(message)) {
    return "You’re welcome. I’m here if you need anything else.";
  }
  if (/^(sorry|apologies|my bad)[.! ]*$/i.test(message)) {
    return "No worries at all. We can continue from where we left off.";
  }

  if (/software development|web development|website|whatsapp automation|digital service/.test(lower)) {
    return "Yes. MedMinds offers custom software development, web development, WhatsApp automation and ZaTafa MedStats. Software projects are quoted after the requirements are understood. What would you like the system to do?";
  }

  if (/^(yes|yes please|please|sure)[.! ]*$/i.test(message) && /list|options|category|categories/.test(lastAssistant)) {
    return "Sure. MedMinds services include research and writing, data analysis, editing and quality assurance, plagiarism and AI checks, courses and training, Pa Gym, academic support, and digital services. Which category would you like me to show first?";
  }

  const asksForLink = /\blink\b|check (it|this) myself|website|web page|page for this|where can i (check|see)|online/i.test(lower);
  if (asksForLink) {
    if (/research|proposal|dissertation|thesis|topic development|research pricing/.test(recentContext)) {
      return "Yes. You can check the current MedMinds research pricing here: https://www.medmindslc.online/pricing. I can still help you work out the exact amount if your institution or deadline changes the price.";
    }
    if (/pa gym|pagym/.test(recentContext)) {
      return "Yes. You can open Pa Gym here: https://medmindslc.site/mayadi.html. If you still need an account, use https://medmindslc.site/pa-gym-start.html?ref=jumamustafap.";
    }

    const offers = await listOffers(true).catch(() => []);
    const contextTerms = `${recentContext} ${lower}`.split(/[^a-z0-9]+/).filter((term) => term.length > 3);
    const ranked = offers.map((offer) => {
      const haystack = `${offer.name} ${offer.category} ${offer.description} ${offer.features.join(" ")}`.toLowerCase();
      const score = contextTerms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { offer, score };
    }).sort((a, b) => b.score - a.score);
    const matched = ranked[0]?.score ? ranked[0].offer : null;
    const url = firstUrl(matched?.paymentInstructions) || matched?.features.map(firstUrl).find(Boolean) || null;
    if (url) return `Yes. You can check it here: ${url}.`;
    return "Yes. The main MedMinds site is https://www.medmindslc.online/. Tell me which service you want to check and I’ll point you to the exact page.";
  }

  if (/research/.test(lower) && /topic/.test(lower)) {
    return "Yes, we can help with research topic development. What programme or level are you doing?";
  }

  if (/proposal/.test(lower) || (/proposal/.test(recentContext) && /how much|price|cost|charge/.test(lower))) {
    const combined = `${lower} ${recentContext}`;
    const level = /ph\.?d|doctor/.test(combined) ? "phd"
      : /master/.test(combined) ? "masters"
      : /bachelor|undergrad/.test(combined) ? "bachelors"
      : /diploma/.test(combined) ? "diploma"
      : null;

    if (!level) return "Yes, we can help with research proposal writing. What level is it: diploma, bachelor’s, master’s or PhD?";

    const offer = (await listOffers(true)).find((item) => item.slug === `proposal-${level}`);
    if (offer && /how much|price|cost|charge/.test(lower) && offer.priceZmw != null) {
      if (offer.rushPriceZmw != null && offer.rushPriceZmw !== offer.priceZmw) {
        return `${offer.name} is ${money(offer.priceZmw)} on the standard timeline and ${money(offer.rushPriceZmw)} for rush work. What deadline are you working with?`;
      }
      return `${offer.name} is ${money(offer.priceZmw)} based on the current MedMinds price.`;
    }
    return `Yes, we can help with ${offer?.name.toLowerCase() || `${level} research proposal writing`}. What deadline are you working with?`;
  }

  if (/data analysis|analyse|analyze|statistics|statistical/.test(lower)) {
    return "Yes, we can help with data analysis. Is your study quantitative, qualitative or mixed methods?";
  }
  if (/pa gym|pagym/.test(lower)) {
    return "Yes, I can help with Pa Gym. Are you looking for theory, OSCE practice, or both?";
  }
  if (/dissertation|thesis/.test(lower)) {
    return "Yes, we can help with dissertation or thesis support. What level are you doing?";
  }

  if (/research|proposal|dissertation|thesis/.test(recentContext)) {
    return "I’m following you. Tell me the next detail or question about the research support and I’ll continue from there.";
  }

  return "I’m here and I can help with that. Tell me a little more about what you need and I’ll continue from there.";
}
