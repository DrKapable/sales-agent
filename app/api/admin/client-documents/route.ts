import { NextResponse } from "next/server";
import {
  deleteClientDocument,
  listClientDocuments,
  MAX_CLIENT_DOCUMENT_BYTES,
  resolveClientDocumentMime,
  sanitizeDocumentFilename,
  saveClientDocument
} from "@/lib/client-documents";
import { listLeads } from "@/lib/store";
import { staffNames } from "@/lib/team-directory";

async function leadByPhone(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return (await listLeads()).find((item) => item.phone.replace(/\D/g, "") === digits) || null;
}

export async function GET(request: Request) {
  const lead = await leadByPhone(new URL(request.url).searchParams.get("phone"));
  if (!lead) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return NextResponse.json({ lead, documents: await listClientDocuments(lead.id), maxBytes: MAX_CLIENT_DOCUMENT_BYTES });
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Upload a valid document." }, { status: 400 });
  const lead = await leadByPhone(String(form.get("phone") || ""));
  if (!lead) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const value = form.get("file");
  if (!(value instanceof File)) return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
  if (value.size <= 0) return NextResponse.json({ error: "The selected document is empty." }, { status: 400 });
  if (value.size > MAX_CLIENT_DOCUMENT_BYTES) {
    return NextResponse.json({ error: `Documents are currently limited to ${Math.round(MAX_CLIENT_DOCUMENT_BYTES / 1024 / 1024)} MB per file.` }, { status: 413 });
  }

  const fileName = sanitizeDocumentFilename(value.name);
  const mimeType = resolveClientDocumentMime(fileName, value.type);
  if (!mimeType) return NextResponse.json({ error: "Unsupported document type. Use PDF, Word, Excel, PowerPoint, TXT or CSV." }, { status: 415 });
  const senderValue = String(form.get("sender") || "").trim();
  const uploadedBy = staffNames.some((name) => name === senderValue) ? senderValue : null;
  const title = String(form.get("title") || "").trim().slice(0, 180) || fileName;
  const document = await saveClientDocument({
    leadId: lead.id,
    phone: lead.phone,
    fileName,
    title,
    mimeType,
    bytes: new Uint8Array(await value.arrayBuffer()),
    uploadedBy
  });
  return NextResponse.json({ lead, document, documents: await listClientDocuments(lead.id), assigned: true, maxBytes: MAX_CLIENT_DOCUMENT_BYTES });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const lead = await leadByPhone(url.searchParams.get("phone"));
  if (!lead) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const documentId = url.searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ error: "Document ID is required." }, { status: 400 });
  const deleted = await deleteClientDocument(documentId, lead.id);
  if (!deleted) return NextResponse.json({ error: "Assigned document not found." }, { status: 404 });
  return NextResponse.json({ deleted: true, documents: await listClientDocuments(lead.id) });
}
