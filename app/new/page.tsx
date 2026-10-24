import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import OpenRetainerForm from "@/components/retainer/OpenRetainerForm";

export default function NewRetainerPage() {
  return (
    <PageShell
      title="Open a Retainer"
      description="Commit funds up front for a provider to draw against with itemized memos."
    >
      <BotChainGate noWalletNote="Connect your wallet on BOT Chain or Bohr Testnet to open a retainer agreement.">
        <OpenRetainerForm />
      </BotChainGate>
    </PageShell>
  );
}
