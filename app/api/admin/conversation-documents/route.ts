import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { commercialDocumentNumber } from "@/lib/commercial-document";
import { listClientDocuments } from "@/lib/client-documents";
import { ensureQuoteDeliveryColumns } from "@/lib/quotation-delivery";
import { listLeads } from "@/lib/store";

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function safeIso(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function GET(request: Request) {
  const phone = digits(new URL(request.url).searchParams.get("phone") || "");
  if (!phone) return NextResponse.json({ error: "Client phone is required." }, { status: 400 });

  const lead = (await listLeads()).find((item) => digits(item.phone) === phone);
  if (!lead) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const assigned = (await listClientDocuments(lead.id))
    .filter((document) => Boolean(document.lastSentAt))
    .map((document) => ({
      id: document.id,
      kind: "shared_file" as const,
      title: document.title,
      fileName: document.fileName,
      mimeType: document.mimeType,
      service: null,
      amountZmw: null,
      details: null,
      documentNumber: null,
      createdAt: document.createdAt,
      sharedAt: document.lastSentAt || document.createdAt,
      sharedBy: document.lastSentBy,
      deliveryStatus: "SENT",
      deliveryError: null,
      downloadUrl: `/api/admin/client-documents/${document.id}?phone=${encodeURIComponent(lead.phone)}`
    }));

  const commercial: Array<Record<string, unknown>> = [];
  if (process.env.DATABASE_URL) {
    await ensureQuoteDeliveryColumns();
    const db = neon(process.env.DATABASE_URL);
    const rows = await db.query(
      `SELECT id,service,amount_zmw,details,status,created_at,delivery_status,delivery_error,submitted_at,delivered_at
       FROM sales_quotes
       WHERE lead_id=$1 AND status IN ('QUOTATION','INVOICE_UNPAID')
       ORDER BY created_at DESC
       LIMIT 50`,
      [lead.id]
    );

    for (const row of rows as Array<Record<string, unknown>>) {
      const status = String(row.status || "QUOTATION");
      const record = {
        id: String(row.id),
        service: String(row.service || "MedMinds service"),
        amount_zmw: row.amount_zmw == null ? null : Number(row.amount_zmw),
        details: String(row.details || ""),
        status,
        created_at: row.created_at ? String(row.created_at) : null
      };
      const number = commercialDocumentNumber(record);
      const invoice = status === "INVOICE_UNPAID";
      const createdAt = safeIso(row.created_at) || new Date().toISOString();
      const submittedAt = safeIso(row.submitted_at);
      const deliveredAt = safeIso(row.delivered_at);
      commercial.push({
        id: record.id,
        kind: invoice ? "invoice" : "quotation",
        title: `MedMinds ${invoice ? "Invoice" : "Quotation"} ${number}`,
        fileName: `MedMinds-${invoice ? "Invoice" : "Quotation"}-${number}.pdf`,
        mimeType: "application/pdf",
        service: record.service,
        amountZmw: record.amount_zmw,
        details: record.details,
        documentNumber: number,
        createdAt,
        sharedAt: deliveredAt || submittedAt || createdAt,
        sharedBy: "Mary Kaunda",
        deliveryStatus: String(row.delivery_status || "NOT_SENT").toUpperCase(),
        deliveryError: row.delivery_error ? String(row.delivery_error) : null,
        downloadUrl: `/api/documents/${record.id}`
      });
    }
  }

  const documents = [...commercial, ...assigned].sort((a, b) =>
    String(b.sharedAt || b.createdAt).localeCompare(String(a.sharedAt || a.createdAt))
  );

  return NextResponse.json({ leadId: lead.id, phone: lead.phone, documents });
}
