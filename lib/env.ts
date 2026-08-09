const whatsappKeys = [
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_GRAPH_VERSION"
] as const;

export function getSetupState() {
  const missingWhatsApp = whatsappKeys.filter((key) => !process.env[key]);
  const aiConfigured = Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY);

  return {
    database: process.env.DATABASE_URL ? "postgres" as const : "memory" as const,
    aiConfigured,
    simulatorEnabled: aiConfigured && process.env.ENABLE_SIMULATOR === "true",
    model: process.env.AI_MODEL || "openai/gpt-5.6-luna",
    whatsappConfigured: missingWhatsApp.length === 0,
    missingWhatsApp,
    adminConfigured: Boolean(process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET)
  };
}
