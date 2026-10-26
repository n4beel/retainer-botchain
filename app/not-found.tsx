import Link from "next/link";
import PageShell from "@/components/layout/PageShell";

export default function NotFound() {
  return (
    <PageShell
      title="404 - Retainer Not Found"
      description="The retainer record or route you requested could not be located on the ledger."
    >
      <div className="rounded-sm border border-[#4A4640] bg-[#242424] p-8 text-center space-y-4">
        <div className="text-4xl font-mono text-[#D4895C]">404</div>
        <p className="text-sm text-[#B3A99A]">
          The requested agreement or page does not exist on this ledger. Verify the retainer ID or return to the overview.
        </p>
        <div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xs bg-[#D4895C] px-4 py-2 text-sm font-semibold text-[#1E1308] hover:bg-[#D4895C]/90 transition"
          >
            Back to Retainers
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
