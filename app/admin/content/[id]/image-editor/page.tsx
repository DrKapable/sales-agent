import { ManualCreativeEditor } from "@/components/manual-creative-editor";

export const dynamic = "force-dynamic";

export default async function ImageEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ManualCreativeEditor postId={id} />;
}
