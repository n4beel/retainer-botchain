"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatEther, type Address } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { retainerAbi } from "@/lib/botchain/abi";
import { isBotChainId, type BotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { shortAddress } from "@/lib/errors";
import { noticeState, reference, type RetainerAgreement } from "@/lib/retainer";

export default function RetainerList() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const [clientRetainers, setClientRetainers] = useState<RetainerAgreement[]>([]);
  const [providerRetainers, setProviderRetainers] = useState<RetainerAgreement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lookupId, setLookupId] = useState<string>("");

  const clientRef = useRef(publicClient);
  clientRef.current = publicClient;

  const loadRetainers = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !address || !isBotChainId(chainId)) {
      setLoading(false);
      return;
    }

    const deployment = getDeployment(chainId as BotChainId);
    const contractAddress = deployment?.address;
    if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Fetch newest agreements for connected address
      const rawList: any = await client.readContract({
        address: contractAddress,
        abi: retainerAbi,
        functionName: "agreementsFor",
        args: [address, 0n, 50n],
      });

      const list: RetainerAgreement[] = rawList.map((item: any) => ({
        id: BigInt(item.id),
        client: item.client,
        provider: item.provider,
        noticePeriod: BigInt(item.noticePeriod),
        noticeStartedAt: BigInt(item.noticeStartedAt),
        noticeEffectiveAt: BigInt(item.noticeEffectiveAt),
        balance: BigInt(item.balance),
        totalDrawn: BigInt(item.totalDrawn),
        draws: Number(item.draws),
        state: Number(item.state) as any,
        createdBlock: Number(item.createdBlock),
      }));

      // Group into As Client and As Provider
      const asClient = list.filter(
        (a) => a.client.toLowerCase() === address.toLowerCase()
      );
      const asProvider = list.filter(
        (a) => a.provider.toLowerCase() === address.toLowerCase()
      );

      setClientRetainers(asClient);
      setProviderRetainers(asProvider);
      setLoading(false);
    } catch (err) {
      console.warn("Failed to load retainers:", err);
      setLoading(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    loadRetainers();
  }, [loadRetainers]);

  return (
    <div className="space-y-8">
      {/* Action Header & Lookup */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Direct lookup input */}
        <div className="flex items-center gap-2 max-w-sm">
          <input
            type="text"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value.replace(/\D/g, ""))}
            placeholder="Statement ID (e.g. 1)"
            className="w-full bg-[#282828] border border-[#4A4640] rounded-xs px-3 py-1.5 text-xs font-mono text-[#EDE6DC] focus:outline-none focus:border-[#D4895C]"
          />
          <Link href={lookupId ? `/r/${lookupId}` : "#"}>
            <Button variant="ghost" size="sm" disabled={!lookupId}>
              View
            </Button>
          </Link>
        </div>

        <Link href="/new">
          <Button variant="primary">Open a Retainer</Button>
        </Link>
      </div>

      {!address ? (
        <Panel tone="sheet" className="p-8 text-center text-xs text-[#B3A99A]">
          Connect your wallet to see your client and provider retainers, or look up a statement by ID above.
        </Panel>
      ) : loading ? (
        <Panel tone="sheet" className="p-8 text-center text-xs text-[#B3A99A]">
          Loading retainers ledger…
        </Panel>
      ) : (
        <div className="space-y-8">
          {/* As Client Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#B3A99A]">
                Retainers as Client ({clientRetainers.length})
              </h3>
            </div>

            {clientRetainers.length === 0 ? (
              <Panel tone="inset" className="p-6 text-center text-xs text-[#B3A99A]">
                You have not opened any retainers as a client.
              </Panel>
            ) : (
              <div className="w-full overflow-x-auto border border-[#4A4640] bg-[#2E2E2E]">
                <table className="w-full min-w-[540px] text-left text-xs border-collapse">
                  <thead className="bg-[#242424] text-[11px] font-semibold text-[#B3A99A] border-b border-[#4A4640]">
                    <tr>
                      <th className="py-2.5 px-3">Reference</th>
                      <th className="py-2.5 px-3">Provider</th>
                      <th className="py-2.5 px-3 text-right">Balance</th>
                      <th className="py-2.5 px-3 text-right">Drawn</th>
                      <th className="py-2.5 px-3 text-center">Notice Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientRetainers.map((a, i) => {
                      const ns = noticeState(a);
                      const isEven = i % 2 === 0;
                      return (
                        <tr
                          key={a.id.toString()}
                          className={`${
                            isEven ? "statement-row-even" : "statement-row-odd"
                          } statement-row-hover border-b border-[#3F3C36]/50 last:border-b-0`}
                        >
                          <td className="py-2 px-3 font-mono font-bold text-[#D4895C]">
                            {reference(a.id)}
                          </td>
                          <td className="py-2 px-3 font-mono text-[#EDE6DC]">
                            {shortAddress(a.provider)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[#EDE6DC]">
                            {formatEther(a.balance)} BOT
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[#B3A99A]">
                            {formatEther(a.totalDrawn)} BOT
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-mono rounded-xs ${
                                a.state !== 0
                                  ? "text-[#B3A99A] bg-[#B3A99A]/10"
                                  : ns === "none"
                                  ? "text-[#B3A99A] bg-[#282828]"
                                  : ns === "pending"
                                  ? "text-[#E8A27E] bg-[#E8A27E]/10"
                                  : "text-[#8CCB9B] bg-[#8CCB9B]/10 font-bold"
                              }`}
                            >
                              {a.state === 1
                                ? "Reclaimed"
                                : a.state === 2
                                ? "Released"
                                : ns === "none"
                                ? "No notice"
                                : ns === "pending"
                                ? "Notice pending"
                                : "Elapsed"}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Link href={`/r/${a.id}`}>
                              <Button variant="ghost" size="sm">
                                Statement →
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* As Provider Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#B3A99A]">
                Retainers as Provider ({providerRetainers.length})
              </h3>
            </div>

            {providerRetainers.length === 0 ? (
              <Panel tone="inset" className="p-6 text-center text-xs text-[#B3A99A]">
                No retainers have designated your address as the provider.
              </Panel>
            ) : (
              <div className="w-full overflow-x-auto border border-[#4A4640] bg-[#2E2E2E]">
                <table className="w-full min-w-[540px] text-left text-xs border-collapse">
                  <thead className="bg-[#242424] text-[11px] font-semibold text-[#B3A99A] border-b border-[#4A4640]">
                    <tr>
                      <th className="py-2.5 px-3">Reference</th>
                      <th className="py-2.5 px-3">Client</th>
                      <th className="py-2.5 px-3 text-right">Balance</th>
                      <th className="py-2.5 px-3 text-right">Drawn</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerRetainers.map((a, i) => {
                      const isEven = i % 2 === 0;
                      return (
                        <tr
                          key={a.id.toString()}
                          className={`${
                            isEven ? "statement-row-even" : "statement-row-odd"
                          } statement-row-hover border-b border-[#3F3C36]/50 last:border-b-0`}
                        >
                          <td className="py-2 px-3 font-mono font-bold text-[#D4895C]">
                            {reference(a.id)}
                          </td>
                          <td className="py-2 px-3 font-mono text-[#EDE6DC]">
                            {shortAddress(a.client)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[#EDE6DC]">
                            {formatEther(a.balance)} BOT
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[#D4895C]">
                            {formatEther(a.totalDrawn)} BOT
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-mono rounded-xs ${
                                a.state === 0
                                  ? "text-[#D4895C] bg-[#D4895C]/15"
                                  : "text-[#B3A99A] bg-[#282828]"
                              }`}
                            >
                              {a.state === 0 ? "Open" : a.state === 1 ? "Reclaimed" : "Released"}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Link href={`/r/${a.id}`}>
                              <Button variant="ghost" size="sm">
                                Statement →
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
