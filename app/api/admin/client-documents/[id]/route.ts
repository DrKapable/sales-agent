import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientDocumentForLead, renameClientDocument } from "@/lib/client-documents";
import { listLeads } from "@/lib/store";

const renameSchema = z.object({
  phone: z.string().trim().min(8).max(40),
  title: z.string().trim().min(1).max(180)
});

async function leadByPhone(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return (await listLeads()).find((item) => item.phone.replace(/\D/g, "") === digits) || null;
}

function safeHeaderFilename(value: string) {
  return value.replace(/["\r\n]/g, "_");
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const lead = await leadByPhone(new URL(request.url).searchParams.get("phone"));
  if (!lead) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const document = await getClientDocumentForLead((await params).id, lead.id);
  if (!document) return NextResponse.json({ error: "This document is not assigned to this client." }, { status: 404 });

  const inline = document.mimeType === "application/pdf" || document.mimeType === "text/plain" || document.mimeType === "text/csv";
  return new Response(document.bytes as BodyInit, {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Length": String(document.sizeBytes),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeHeaderFilename(document.fileName)}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid document title." }, { status: 400 });
  const lead = await leadByPhone(parsed.data.phone);
  if (!lead) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const document = await renameClientDocument((await params).id, lead.id, parsed.data.title);
  if (!document) return NextResponse.json({ error: "Assigned document not found." }, { status: 404 });
  return NextResponse.json({ document });
}
