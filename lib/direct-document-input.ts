import { z } from "zod";

export function normalizeClientWhatsAppNumber(value: string) {
  const trimmed = value.trim();
  if (!/^[+\d\s().-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0[79]\d{8}$/.test(digits)) digits = `260${digits.slice(1)}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export const clientWhatsAppNumberSchema = z.string().min(8).max(40).transform((value, ctx) => {
  const phone = normalizeClientWhatsAppNumber(value);
  if (!phone) { ctx.addIssue({ code: "custom", message: "Enter a valid WhatsApp number with country code, or a Zambian 09/07 number." }); return z.NEVER; }
  return phone;
});

const clientFields = { phone: clientWhatsAppNumberSchema, name: z.string().trim().min(2).max(160), service: z.string().trim().min(2).max(240) };
export const directDocumentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_quotation"), ...clientFields,
    amountZmw: z.number().positive().max(100000000), details: z.string().trim().min(3).max(1800) }),
  z.object({ action: z.literal("create_receipt"), ...clientFields,
    totalChargedZmw: z.number().positive().max(100000000), amountPaidZmw: z.number().positive().max(100000000),
    reference: z.string().trim().min(2).max(160), verified: z.literal(true), verifiedBy: z.string().trim().min(2).max(160) }),
  z.object({ action: z.literal("send"), phone: clientWhatsAppNumberSchema, kind: z.enum(["quotation", "receipt"]), documentId: z.string().uuid() })
]).superRefine((input, ctx) => {
  if (input.action === "create_receipt" && input.amountPaidZmw > input.totalChargedZmw) ctx.addIssue({ code: "custom", path: ["amountPaidZmw"], message: "Amount paid cannot exceed the total charged." });
});
