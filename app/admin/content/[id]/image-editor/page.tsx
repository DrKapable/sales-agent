import { requireAdmin } from "@/lib/session";
import { ManualCreativeEditor } from "@/components/manual-creative-editor";

export default async function ImageEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  return <ManualCreativeEditor postId={id} />;
}
