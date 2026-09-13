import { CanvaCreativeWorkspace } from "@/components/canva-creative-workspace";

export const dynamic = "force-dynamic";

export default async function CanvaCreativePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CanvaCreativeWorkspace postId={id} />;
}
