import PageShell from "@/components/layout/PageShell";
import RetainerStatementView from "@/components/retainer/RetainerStatementView";

interface RetainerPageProps {
  params: Promise<{ id: string }>;
}

export default async function RetainerPage({ params }: RetainerPageProps) {
  const { id } = await params;
  let agreementId: bigint;

  try {
    agreementId = BigInt(id);
  } catch {
    return (
      <PageShell title="Invalid Statement">
        <div className="p-8 text-center text-[#E8A27E] font-mono text-sm border border-[#4A4640] bg-[#2E2E2E]">
          Invalid statement identifier: {id}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <RetainerStatementView id={agreementId} />
    </PageShell>
  );
}
