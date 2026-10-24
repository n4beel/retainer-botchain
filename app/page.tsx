import PageShell from "@/components/layout/PageShell";
import RetainerList from "@/components/retainer/RetainerList";
import { app } from "@/lib/app-config";

export default function Home() {
  return (
    <PageShell
      title="Retainer Ledger"
      description="Pay in advance. Draw as the work happens. Reclaim unspent balance with notice."
    >
      <RetainerList />
    </PageShell>
  );
}
