import { requireAdmin } from "@/lib/session";
import { CanvaCreativeWorkspace } from "@/components/canva-creative-workspace";

export default async function CanvaCreativePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  return <CanvaCreativeWorkspace postId={id} />;
}
