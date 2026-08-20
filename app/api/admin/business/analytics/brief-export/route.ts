import { NextResponse } from "next/server";
import { z } from "zod";
import { createManagementBriefPdf } from "@/lib/management-brief-export";
import { createManagementBriefDocx } from "@/lib/management-brief-docx";

const schema = z.object({
  format: z.enum(["pdf", "word"]),
  analysis: z.string().trim().min(20).max(30000),
  generatedAt: z.string().max(80).optional(),
  days: z.number().int().min(7).max(365).optional()
});

function fileDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid management brief export request." }, { status: 400 });

  const input = {
    analysis: parsed.data.analysis,
    generatedAt: parsed.data.generatedAt,
    days: parsed.data.days
  };
  const stamp = fileDate(parsed.data.generatedAt);

  if (parsed.data.format === "pdf") {
    const pdf = createManagementBriefPdf(input);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="MedMinds-Management-Brief-${stamp}.pdf"`,
        "Cache-Control": "private, no-store"
      }
    });
  }

  const word = createManagementBriefDocx(input);
  return new NextResponse(new Uint8Array(word), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="MedMinds-Management-Brief-${stamp}.docx"`,
      "Cache-Control": "private, no-store"
    }
  });
}
