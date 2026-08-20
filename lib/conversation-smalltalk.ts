const BUSINESS_SIGNAL = /\b(?:how much|price|pricing|cost|fee|fees|charge|charges|rate|quotation|quote|invoice|receipt|payment|pay|proposal|dissertation|thesis|research|methodology|literature review|data analysis|questionnaire|course|training|pa\s*gym|osce|theory|software|website|web development|app|application|system|automation|whatsapp automation|cybersecurity|deadline|due date|programme|program|academic level|proceed|go ahead|start the work|book|order|service|services|help with|assist with|support with)\b/i;

const SOCIAL_PATTERNS = [
  /^(?:hi|hello|hey|hiya|hey there|hello there|good morning|good afternoon|good evening)(?:\s+(?:mary|there|again))?[\s!.👋🙂😊✨]*$/i,
  /^(?:hi|hello|hey|hiya|good morning|good afternoon|good evening)[,\s]+(?:how are you|how are you doing|how have you been|how'?s it going)[\s?!.🙂😊]*$/i,
  /^(?:how are you|how are you doing|how have you been|how'?s it going|how is it going|how is your day|how'?s your day|hope you'?re well|hope you are well|are you okay|are you ok)[\s?!.🙂😊]*$/i,
  /^(?:(?:i'?m|i am)\s+)?(?:fine|good|great|okay|ok|alright|not bad)(?:[,\s]+(?:thanks|thank you|and you|how about you))*[\s!.🙂😊]*$/i,
  /^(?:thanks|thank you|thank you so much|thanks a lot|much appreciated|appreciate it|i appreciate it)[\s!.🙏🙂😊❤️❤]*$/i,
  /^(?:you'?re welcome|welcome|no worries|all good)[\s!.🙂😊]*$/i,
  /^(?:bye|goodbye|good night|goodnight|talk later|speak later|see you|see you later|catch you later)[\s!.👋🙂😊]*$/i,
  /^(?:lol|lmao|haha+|hehe+|😂+|🤣+|😊+|🙂+|👍+|🙏+|❤️+|❤+|👌+|👋+)[\s!.]*$/i,
  /^(?:what are you doing|what'?s up|whats up|sup|how was your day|did you miss me)[\s?!.🙂😊]*$/i
];

export function isCasualConversationTurn(text: string) {
  const clean = text.trim();
  if (!clean || clean.length > 220) return false;
  if (BUSINESS_SIGNAL.test(clean)) return false;
  return SOCIAL_PATTERNS.some((pattern) => pattern.test(clean));
}

export function casualConversationFallback(text: string) {
  const clean = text.trim();
  if (/\bhow are you|how are you doing|how have you been|how'?s it going|how is it going\b/i.test(clean)) {
    return "I’m good, thanks 😊 How are you?";
  }
  if (/^(?:thanks|thank you|thank you so much|thanks a lot|much appreciated|appreciate it|i appreciate it)\b/i.test(clean)) {
    return "You’re welcome 😊";
  }
  if (/^(?:bye|goodbye|good night|goodnight|talk later|speak later|see you|see you later|catch you later)\b/i.test(clean)) {
    return "Alright 😊 Talk to you later.";
  }
  if (/^(?:hi|hello|hey|hiya|hey there|hello there|good morning|good afternoon|good evening)\b/i.test(clean)) {
    return "Hey 😊 Good to hear from you. How are you?";
  }
  return "😊 I’m here. What’s on your mind?";
}
