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

async function leadById(id: string) {
  return (await listLeads()).find((item) => item.id === id) || null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await leadById(id);
  if (!lead) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return NextResponse.json({ documents: await listClientDocuments(lead.id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await leadById(id);
  if (!lead) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Upload a valid document." }, { status: 400 });
  const value = form.get("file");
  if (!(value instanceof File)) return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
  if (value.size <= 0) return NextResponse.json({ error: "The selected document is empty." }, { status: 400 });
  if (value.size > MAX_CLIENT_DOCUMENT_BYTES) {
    return NextResponse.json({ error: `Documents are currently limited to ${Math.round(MAX_CLIENT_DOCUMENT_BYTES / 1024 / 1024)} MB per file.` }, { status: 413 });
  }

  const fileName = sanitizeDocumentFilename(value.name);
  const mimeType = resolveClientDocumentMime(fileName, value.type);
  if (!mimeType) {
    return NextResponse.json({ error: "Unsupported document type. Use PDF, Word, Excel, PowerPoint, TXT or CSV." }, { status: 415 });
  }

  const senderValue = String(form.get("sender") || "").trim();
  const uploadedBy = staffNames.some((name) => name === senderValue) ? senderValue : null;
  const titleValue = String(form.get("title") || "").trim().slice(0, 180);
  const bytes = new Uint8Array(await value.arrayBuffer());
  const document = await saveClientDocument({
    leadId: lead.id,
    phone: lead.phone,
    fileName,
    title: titleValue || fileName,
    mimeType,
    bytes,
    uploadedBy
  });
  const documents = await listClientDocuments(lead.id);
  return NextResponse.json({ document, documents, assigned: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await leadById(id);
  if (!lead) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ error: "Document ID is required." }, { status: 400 });
  const deleted = await deleteClientDocument(documentId, lead.id);
  if (!deleted) return NextResponse.json({ error: "Assigned document not found." }, { status: 404 });
  return NextResponse.json({ deleted: true, documents: await listClientDocuments(lead.id) });
}
