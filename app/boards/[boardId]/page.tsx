import BoardClient from "@/components/board/BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  return <BoardClient boardId={boardId} />;
}
