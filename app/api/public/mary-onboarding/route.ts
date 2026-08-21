import { NextResponse } from "next/server";
import { z } from "zod";
import { sendClientWhatsAppDocument } from "@/lib/client-document-whatsapp";
import {
  buildApplicantWhatsAppUrl,
  buildMaryOnboardingAlert,
  markMaryOnboardingNotification,
  MaryOnboardingUnavailableError,
  MAX_ONBOARDING_DOCUMENT_BYTES,
  monthlyEnquiryRanges,
  onboardingUseCases,
  organisationTypes,
  resolveOnboardingDocumentMime,
  sanitizeOnboardingFilename,
  saveMaryOnboarding,
  validateOnboardingDocumentBytes
} from "@/lib/mary-onboarding";
import { allowRequest } from "@/lib/rate-limit";
import { referralRecipients } from "@/lib/referrals";
import { sendWhatsAppText } from "@/lib/whatsapp";

export const runtime = "nodejs";

const cleanText = (minimum: number, maximum: number) => z.string()
  .trim()
  .min(minimum)
  .max(maximum)
  .transform((value) => value.replace(/\s+/g, " "));

const schema = z.object({
  registered: z.literal("yes"),
  legalName: cleanText(2, 160),
  tradingName: z.string().trim().max(160).transform((value) => value.replace(/\s+/g, " ")).optional(),
  organisationType: z.enum(organisationTypes),
  registrationNumber: cleanText(2, 80),
  tpin: z.string().trim().max(40).transform((value) => value.replace(/\s+/g, " ")).optional(),
  town: cleanText(2, 100),
  contactName: cleanText(2, 140),
  contactRole: cleanText(2, 100),
  contactPhone: z.string().trim().min(8).max(30),
  contactEmail: z.email().max(180),
  useCase: z.enum(onboardingUseCases),
  monthlyEnquiries: z.enum(monthlyEnquiryRanges),
  documentKind: z.enum(["Certificate of incorporation", "Business registration certificate"]),
  consent: z.literal("on"),
  website: z.string().max(0).optional()
});

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return `mary-onboarding:${forwarded || realIp || "unknown"}`;
}

function normalizeContactPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0\d{9}$/.test(digits)) digits = `260${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export async function POST(request: Request) {
  if (!allowRequest(clientKey(request), 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many onboarding attempts. Please wait before trying again." },
      { status: 429 }
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_ONBOARDING_DOCUMENT_BYTES + 256 * 1024) {
    return NextResponse.json({ error: "The registration document must be 4 MB or smaller." }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Submit a valid onboarding form." }, { status: 400 });

  const parsed = schema.safeParse({
    registered: form.get("registered"),
    legalName: form.get("legalName"),
    tradingName: form.get("tradingName"),
    organisationType: form.get("organisationType"),
    registrationNumber: form.get("registrationNumber"),
    tpin: form.get("tpin"),
    town: form.get("town"),
    contactName: form.get("contactName"),
    contactRole: form.get("contactRole"),
    contactPhone: form.get("contactPhone"),
    contactEmail: form.get("contactEmail"),
    useCase: form.get("useCase"),
    monthlyEnquiries: form.get("monthlyEnquiries"),
    documentKind: form.get("documentKind"),
    consent: form.get("consent"),
    website: form.get("website")
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please complete every required field with valid information." },
      { status: 400 }
    );
  }

  const contactPhone = normalizeContactPhone(parsed.data.contactPhone);
  if (!contactPhone) {
    return NextResponse.json({ error: "Enter a valid WhatsApp number, including the country code." }, { status: 400 });
  }

  const fileValue = form.get("registrationDocument");
  if (!(fileValue instanceof File)) {
    return NextResponse.json({ error: "Upload the required registration document." }, { status: 400 });
  }
  if (fileValue.size > MAX_ONBOARDING_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "The registration document must be 4 MB or smaller." }, { status: 413 });
  }

  const fileName = sanitizeOnboardingFilename(fileValue.name);
  const mimeType = resolveOnboardingDocumentMime(fileName, fileValue.type)
    || resolveOnboardingDocumentMime(fileName, null);
  if (!mimeType) {
    return NextResponse.json({ error: "Use a PDF, JPG or PNG registration document." }, { status: 415 });
  }
  const bytes = new Uint8Array(await fileValue.arrayBuffer());
  const validation = validateOnboardingDocumentBytes(fileName, mimeType, bytes);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.reason }, { status: 415 });
  }

  try {
    const submission = await saveMaryOnboarding({
      legalName: parsed.data.legalName,
      tradingName: parsed.data.tradingName || null,
      organisationType: parsed.data.organisationType,
      registrationNumber: parsed.data.registrationNumber,
      tpin: parsed.data.tpin || null,
      town: parsed.data.town,
      contactName: parsed.data.contactName,
      contactRole: parsed.data.contactRole,
      contactPhone,
      contactEmail: parsed.data.contactEmail.toLowerCase(),
      useCase: parsed.data.useCase,
      monthlyEnquiries: parsed.data.monthlyEnquiries,
      documentKind: parsed.data.documentKind,
      fileName,
      mimeType,
      bytes
    });

    const recipient = referralRecipients.mustafa.phone;
    const notificationResults = recipient
      ? await Promise.allSettled([
          sendWhatsAppText(recipient, buildMaryOnboardingAlert(submission)),
          sendClientWhatsAppDocument({
            phone: recipient,
            bytes,
            filename: fileName,
            mimeType,
            caption: `${submission.reference}: ${submission.documentKind} for ${submission.legalName}`
          })
        ])
      : [];
    const sentCount = notificationResults.filter((result) => result.status === "fulfilled").length;
    const summarySent = notificationResults[0]?.status === "fulfilled";
    const notificationStatus = sentCount === 2 ? "sent" : sentCount === 1 ? "partial" : "failed";
    await markMaryOnboardingNotification(submission.reference, notificationStatus).catch(() => undefined);

    notificationResults.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error("Mary onboarding WhatsApp delivery failed", {
          reference: submission.reference,
          part: index === 0 ? "summary" : "document",
          error: result.reason
        });
      }
    });

    return NextResponse.json({
      reference: submission.reference,
      whatsappUrl: buildApplicantWhatsAppUrl(submission),
      notified: summarySent
    });
  } catch (error) {
    if (error instanceof MaryOnboardingUnavailableError) {
      return NextResponse.json(
        { error: "Secure onboarding is temporarily unavailable. Please contact Mary on WhatsApp." },
        { status: 503 }
      );
    }
    console.error("Mary onboarding submission failed", { error });
    return NextResponse.json(
      { error: "The onboarding form could not be saved. Please try again." },
      { status: 500 }
    );
  }
}
