import { NextResponse } from "next/server";
import { deleteContentPost, getContentPost } from "@/lib/content-studio";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = await getContentPost(id);
  if (!post) return NextResponse.json({ error: "Content post not found." }, { status: 404 });
  return NextResponse.json(post);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const post = await getContentPost(id);
  if (!post) return NextResponse.json({ error: "Content post not found." }, { status: 404 });
  await deleteContentPost(id);
  return NextResponse.json({ ok: true });
}
