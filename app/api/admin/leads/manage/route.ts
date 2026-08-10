import { NextResponse } from "next/server";
import { z } from "zod";
import { archiveChat, deleteChat, listArchivedLeads, restoreChat } from "@/lib/chat-lifecycle";

const actionSchema = z.object({
  phone: z.string().trim().min(8).max(40),
  action: z.enum(["archive", "restore", "delete"])
});

export async function GET() {
  return NextResponse.json({ chats: await listArchivedLeads() });
}

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid chat action." }, { status: 400 });
  const { phone, action } = parsed.data;

  try {
    if (action === "archive") {
      const archivedAt = await archiveChat(phone);
      return NextResponse.json({ ok: true, action, archivedAt });
    }
    if (action === "restore") {
      await restoreChat(phone);
      return NextResponse.json({ ok: true, action });
    }
    await deleteChat(phone);
    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error("Chat lifecycle action failed", { action, phoneSuffix: phone.slice(-4), error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update this chat." }, { status: 500 });
  }
}
