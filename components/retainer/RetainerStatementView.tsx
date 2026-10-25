"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatEther, parseEther, type Address, type Hex } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";
import StatementTable from "./StatementTable";
import { retainerAbi } from "@/lib/botchain/abi";
import { isBotChainId, type BotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { describeError, formatNoticeDate, shortAddress } from "@/lib/errors";
import {
  canDraw,
  loadStatement,
  maxDraw,
  noticeState,
  reference,
  validateMemo,
  type RetainerAgreement,
  type Statement,
} from "@/lib/retainer";

interface RetainerStatementViewProps {
  id: bigint;
}

type ActionType = "draw" | "topUp" | "giveNotice" | "cancelNotice" | "reclaim" | "release" | "withdraw";
type Stage = "idle" | "signing" | "confirming" | "confirmed" | "reverted";

export default function RetainerStatementView({ id }: RetainerStatementViewProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { toast } = useToast();

  const [agreement, setAgreement] = useState<RetainerAgreement | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [pendingBal, setPendingBal] = useState<bigint>(0n);
  const [scopeText, setScopeText] = useState<string>("Engagement");
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form states
  const [drawAmount, setDrawAmount] = useState("");
  const [drawMemo, setDrawMemo] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");

  // Confirmation modals
  const [confirmModal, setConfirmModal] = useState<"reclaim" | "release" | "giveNotice" | null>(null);

  // Transaction states
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const settledRef = useRef<Hex | null>(null);
  const clientRef = useRef(publicClient);
  clientRef.current = publicClient;

  const { writeContractAsync } = useWriteContract();
  const { data: receipt, isSuccess, isError, error: receiptError } =
    useWaitForTransactionReceipt({ hash: txHash ?? undefined });

  // Load agreement and statement data
  const fetchData = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;

    if (!isBotChainId(chainId)) {
      setLoadError("Please connect to BOT Chain or Bohr Testnet.");
      setLoading(false);
      return;
    }

    const deployment = getDeployment(chainId as BotChainId);
    const contractAddress = deployment?.address;
    if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
      setLoadError("Retainer contract not deployed on this network.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data: any = await client.readContract({
        address: contractAddress,
        abi: retainerAbi,
        functionName: "agreementOf",
        args: [id],
      });

      const ag: RetainerAgreement = {
        id: BigInt(data.id),
        client: data.client,
        provider: data.provider,
        noticePeriod: BigInt(data.noticePeriod),
        noticeStartedAt: BigInt(data.noticeStartedAt),
        noticeEffectiveAt: BigInt(data.noticeEffectiveAt),
        balance: BigInt(data.balance),
        totalDrawn: BigInt(data.totalDrawn),
        draws: Number(data.draws),
        state: Number(data.state) as any,
        createdBlock: Number(data.createdBlock),
      };

      setAgreement(ag);

      // Load pending for connected user if present
      if (address) {
        try {
          const pend = await client.readContract({
            address: contractAddress,
            abi: retainerAbi,
            functionName: "pending",
            args: [address],
          });
          setPendingBal(BigInt(pend));
        } catch {
          // ignore
        }
      }

      // Load statement logs
      const st = await loadStatement(client, contractAddress, id, BigInt(ag.createdBlock));
      setStatement(st);

      // Grab scope from first Opened row if available
      if (st.rows.length > 0 && st.rows[0].memo.startsWith("Opening deposit · ")) {
        setScopeText(st.rows[0].memo.replace("Opening deposit · ", ""));
      }

      setLoading(false);
    } catch (err) {
      setLoadError(describeError(err));
      setLoading(false);
    }
  }, [chainId, id, address]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle transaction confirmation
  useEffect(() => {
    if (!txHash || settledRef.current === txHash) return;

    if (isSuccess && receipt) {
      settledRef.current = txHash;
      setStage("confirmed");
      toast(
        "success",
        "Transaction confirmed",
        `Action completed on BOT Chain block #${receipt.blockNumber}.`
      );
      fetchData();
    } else if (isError) {
      settledRef.current = txHash;
      setStage("reverted");
      setTxError(describeError(receiptError));
    }
  }, [txHash, isSuccess, isError, receipt, receiptError, toast, fetchData]);

  // Action dispatcher
  async function executeAction(action: ActionType, fnName: string, args: any[], value: bigint = 0n) {
    if (!isBotChainId(chainId)) return;
    const deployment = getDeployment(chainId as BotChainId);
    const contractAddress = deployment?.address;
    if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") return;

    setActiveAction(action);
    setTxError(null);
    setStage("signing");

    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: retainerAbi,
        functionName: fnName as any,
        args: args as any,
        ...(value > 0n ? { value } : {}),
      } as any);

      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("idle");
      setActiveAction(null);
      setTxError(describeError(err));
    }
  }

  const memoValidation = useMemo(() => validateMemo(drawMemo), [drawMemo]);

  const isClient = useMemo(() => {
    if (!address || !agreement) return false;
    return address.toLowerCase() === agreement.client.toLowerCase();
  }, [address, agreement]);

  const isProvider = useMemo(() => {
    if (!address || !agreement) return false;
    return address.toLowerCase() === agreement.provider.toLowerCase();
  }, [address, agreement]);

  const nState = useMemo(() => {
    if (!agreement) return "none";
    return noticeState(agreement);
  }, [agreement]);

  const balanceMismatch = useMemo(() => {
    if (!agreement || !statement) return false;
    return agreement.balance !== statement.balance;
  }, [agreement, statement]);

  // FIRST conditional branch for confirmed
  if (stage === "confirmed") {
    return (
      <Panel tone="sheet" className="max-w-md mx-auto my-12 text-center p-8">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xs bg-[#D4895C]/20 text-[#D4895C]">
          ✓
        </div>
        <h3 className="text-base font-bold text-[#EDE6DC]">Transaction Completed</h3>
        <p className="mt-2 text-xs text-[#B3A99A]">
          The statement has been updated on-chain.
        </p>
        <div className="mt-6">
          <Button
            variant="primary"
            onClick={() => {
              setStage("idle");
              setTxHash(null);
              setActiveAction(null);
              setDrawAmount("");
              setDrawMemo("");
              setTopUpAmount("");
              setConfirmModal(null);
            }}
          >
            Back to Statement
          </Button>
        </div>
      </Panel>
    );
  }

  if (loading && !agreement) {
    return (
      <Panel tone="sheet" className="p-8 text-center text-xs text-[#B3A99A]">
        Loading statement ledger…
      </Panel>
    );
  }

  if (loadError || !agreement) {
    return (
      <Panel tone="sheet" className="p-8 text-center">
        <h3 className="text-sm font-semibold text-[#E8A27E]">Statement Unavailable</h3>
        <p className="mt-1 text-xs text-[#B3A99A]">
          {loadError || "Agreement not found on this network."}
        </p>
        <Link href="/" className="mt-4 inline-block">
          <Button variant="ghost" size="sm">
            View All Retainers
          </Button>
        </Link>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Letterhead Band */}
      <Panel tone="sheet" className="p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-[#D4895C]">
                {reference(agreement.id)}
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono uppercase font-semibold rounded-xs ${
                  agreement.state === 0
                    ? "bg-[#D4895C]/20 text-[#D4895C] border border-[#D4895C]/30"
                    : agreement.state === 1
                    ? "bg-[#B3A99A]/20 text-[#B3A99A] border border-[#B3A99A]/30"
                    : "bg-[#8CCB9B]/20 text-[#8CCB9B] border border-[#8CCB9B]/30"
                }`}
              >
                {agreement.state === 0 ? "Open" : agreement.state === 1 ? "Reclaimed" : "Released"}
              </span>
            </div>
            <h2 className="mt-1 font-sans text-base sm:text-lg font-medium text-[#EDE6DC]">
              {scopeText}
            </h2>
          </div>

          {/* Client -> Provider with copper arrow */}
          <div className="flex items-center gap-3 bg-[#282828] border border-[#4A4640] px-3.5 py-2 rounded-xs text-xs font-mono">
            <div className="flex flex-col">
              <span className="text-[10px] text-[#B3A99A] uppercase">Client</span>
              <span className="text-[#EDE6DC] font-medium">{shortAddress(agreement.client)}</span>
            </div>
            <div className="text-[#D4895C] px-1 font-bold text-sm">→</div>
            <div className="flex flex-col">
              <span className="text-[10px] text-[#B3A99A] uppercase">Provider</span>
              <span className="text-[#EDE6DC] font-medium">{shortAddress(agreement.provider)}</span>
            </div>
          </div>
        </div>

        {/* Copper rule */}
        <div className="letterhead-rule mt-5" />
      </Panel>

      {/* 2. Figure Strip */}
      <Panel tone="strip" padded={false} className="border border-[#4A4640]">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#4A4640]">
          {/* Balance */}
          <div className="p-4 sm:p-5">
            <span className="block text-[11px] font-sans font-medium uppercase tracking-wider text-[#B3A99A]">
              Balance
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl sm:text-3xl font-bold text-[#EDE6DC]">
                {formatEther(agreement.balance)}
              </span>
              <span className="font-mono text-xs text-[#B3A99A]">BOT</span>
            </div>
            <span className="mt-1 block text-[11px] text-[#B3A99A]">
              Committed in contract escrow
            </span>
          </div>

          {/* Drawn to date */}
          <div className="p-4 sm:p-5">
            <span className="block text-[11px] font-sans font-medium uppercase tracking-wider text-[#B3A99A]">
              Drawn to date
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl sm:text-3xl font-bold text-[#D4895C]">
                {formatEther(agreement.totalDrawn)}
              </span>
              <span className="font-mono text-xs text-[#B3A99A]">BOT</span>
            </div>
            <span className="mt-1 block text-[11px] text-[#B3A99A]">
              Across {agreement.draws} itemized {agreement.draws === 1 ? "draw" : "draws"}
            </span>
          </div>

          {/* Notice */}
          <div className="p-4 sm:p-5">
            <span className="block text-[11px] font-sans font-medium uppercase tracking-wider text-[#B3A99A]">
              Notice
            </span>
            <div className="mt-1">
              {agreement.state !== 0 ? (
                <span className="font-mono text-lg sm:text-xl font-bold text-[#B3A99A]">
                  Finalized
                </span>
              ) : nState === "none" ? (
                <span className="font-mono text-lg sm:text-xl font-bold text-[#EDE6DC]">
                  No notice served
                </span>
              ) : nState === "pending" ? (
                <span className="font-mono text-base sm:text-lg font-bold text-[#E8A27E]">
                  Pending ({formatNoticeDate(agreement.noticeEffectiveAt)})
                </span>
              ) : (
                <span className="font-mono text-lg sm:text-xl font-bold text-[#8CCB9B]">
                  Elapsed · Reclaimable
                </span>
              )}
            </div>
            <span className="mt-1 block text-[11px] text-[#B3A99A]">
              {agreement.noticePeriod ? `${Number(agreement.noticePeriod) / 86400} day requirement` : ""}
            </span>
          </div>
        </div>
      </Panel>

      {/* Balance Mismatch Warning if ever detected */}
      {balanceMismatch && (
        <div className="p-3 bg-[#E8A27E]/20 border border-[#E8A27E] text-xs text-[#E8A27E] rounded-xs font-mono">
          Warning: Reconstructed statement balance does not match contract balance.
        </div>
      )}

      {/* Main Layout: Statement Table + Actions Column */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Statement Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-[#B3A99A]">
              Statement of Account
            </h3>
            <button
              onClick={() => fetchData()}
              className="text-[11px] font-mono text-[#D4895C] hover:underline"
            >
              Refetch
            </button>
          </div>

          <StatementTable
            rows={statement ? statement.rows : []}
            currentBalance={agreement.balance}
          />

          <div className="p-3 bg-[#282828] border border-[#4A4640] rounded-xs text-[11px] text-[#B3A99A] leading-relaxed">
            <span className="text-[#EDE6DC] font-semibold">Limit: </span>
            The provider can draw any amount up to the balance at any time. The client's protection
            is the notice period, not a veto.
          </div>
        </div>

        {/* Right Column (desktop 300px sticky / mobile card): Viewer Role Actions */}
        <div className="lg:col-span-4 space-y-4">
          <Panel tone="sheet" className="p-4 sm:p-5 sticky top-20">
            <div className="border-b border-[#4A4640] pb-2.5 mb-4">
              <span className="text-[10px] font-mono uppercase text-[#B3A99A]">Actions</span>
              <h4 className="text-sm font-bold text-[#EDE6DC]">
                {isProvider
                  ? "Provider Controls"
                  : isClient
                  ? "Client Controls"
                  : "Ledger Observer"}
              </h4>
            </div>

            {/* Provider Actions */}
            {isProvider && agreement.state === 0 && (
              <div className="space-y-4">
                {/* Draw Form */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <label className="text-[#EDE6DC] font-medium">Draw Amount</label>
                    <button
                      type="button"
                      onClick={() => setDrawAmount(formatEther(maxDraw(agreement)))}
                      className="text-[10px] font-mono text-[#D4895C] hover:underline"
                    >
                      Max ({formatEther(maxDraw(agreement))})
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={drawAmount}
                      onChange={(e) => setDrawAmount(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-[#282828] border border-[#4A4640] rounded-xs px-3 py-1.5 text-xs font-mono text-[#EDE6DC] focus:outline-none focus:border-[#D4895C]"
                    />
                    <div className="absolute inset-y-0 right-3 flex items-center text-xs font-mono text-[#B3A99A] pointer-events-none">
                      BOT
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <label className="text-[#EDE6DC]">Memo (Invoice Line)</label>
                      <span className="font-mono text-[#B3A99A]">{memoValidation.byteLength}/100</span>
                    </div>
                    <input
                      type="text"
                      value={drawMemo}
                      onChange={(e) => setDrawMemo(e.target.value)}
                      placeholder="What this draw is for"
                      className="w-full bg-[#282828] border border-[#4A4640] rounded-xs px-3 py-1.5 text-xs text-[#EDE6DC] focus:outline-none focus:border-[#D4895C]"
                    />
                  </div>

                  <Button
                    variant="primary"
                    disabled={
                      !canDraw(agreement, address) ||
                      !memoValidation.ok ||
                      !drawAmount ||
                      stage !== "idle"
                    }
                    loading={activeAction === "draw" && (stage === "signing" || stage === "confirming")}
                    onClick={() => {
                      try {
                        const amt = parseEther(drawAmount);
                        executeAction("draw", "draw", [id, amt, drawMemo]);
                      } catch (e) {
                        setTxError("Enter a valid amount.");
                      }
                    }}
                    className="w-full py-2"
                  >
                    Draw against retainer
                  </Button>
                </div>

                <div className="border-t border-[#4A4640] pt-3">
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmModal("release")}
                    disabled={stage !== "idle" || agreement.balance === 0n}
                    className="w-full py-1.5 text-xs text-[#B3A99A]"
                  >
                    Release Early ({formatEther(agreement.balance)} BOT)
                  </Button>
                </div>
              </div>
            )}

            {/* Client Actions */}
            {isClient && agreement.state === 0 && (
              <div className="space-y-4">
                {/* Top Up */}
                <div className="space-y-2">
                  <label className="text-xs text-[#EDE6DC] font-medium block">
                    Top Up Balance
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-[#282828] border border-[#4A4640] rounded-xs px-3 py-1.5 text-xs font-mono text-[#EDE6DC] focus:outline-none focus:border-[#D4895C]"
                    />
                    <div className="absolute inset-y-0 right-3 flex items-center text-xs font-mono text-[#B3A99A] pointer-events-none">
                      BOT
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={!topUpAmount || stage !== "idle"}
                    loading={activeAction === "topUp" && (stage === "signing" || stage === "confirming")}
                    onClick={() => {
                      try {
                        const amt = parseEther(topUpAmount);
                        executeAction("topUp", "topUp", [id], amt);
                      } catch {
                        setTxError("Enter a valid amount.");
                      }
                    }}
                    className="w-full py-1.5"
                  >
                    Top Up Retainer
                  </Button>
                </div>

                <div className="border-t border-[#4A4640] pt-3 space-y-2">
                  {nState === "none" && (
                    <Button
                      variant="outline"
                      onClick={() => setConfirmModal("giveNotice")}
                      disabled={stage !== "idle"}
                      className="w-full py-2"
                    >
                      Give Notice
                    </Button>
                  )}

                  {nState === "pending" && (
                    <Button
                      variant="ghost"
                      onClick={() => executeAction("cancelNotice", "cancelNotice", [id])}
                      disabled={stage !== "idle"}
                      loading={activeAction === "cancelNotice" && (stage === "signing" || stage === "confirming")}
                      className="w-full py-2"
                    >
                      Cancel Notice (Restart Clock)
                    </Button>
                  )}

                  {nState === "elapsed" && (
                    <Button
                      variant="primary"
                      onClick={() => setConfirmModal("reclaim")}
                      disabled={stage !== "idle"}
                      className="w-full py-2 bg-[#8CCB9B] text-[#1E1308]"
                    >
                      Reclaim {formatEther(agreement.balance)} BOT
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Pending Withdrawal for Client */}
            {pendingBal > 0n && (
              <div className="mt-4 p-3 bg-[#8CCB9B]/15 border border-[#8CCB9B]/40 rounded-xs space-y-2">
                <span className="text-[11px] font-medium text-[#8CCB9B] block">
                  Pending funds available from early releases
                </span>
                <span className="font-mono text-base font-bold text-[#EDE6DC] block">
                  {formatEther(pendingBal)} BOT
                </span>
                <Button
                  variant="primary"
                  onClick={() => executeAction("withdraw", "withdraw", [])}
                  disabled={stage !== "idle"}
                  loading={activeAction === "withdraw" && (stage === "signing" || stage === "confirming")}
                  className="w-full py-1.5"
                >
                  Collect Pending BOT
                </Button>
              </div>
            )}

            {/* Read-Only Visitor */}
            {!isClient && !isProvider && (
              <div className="p-3 bg-[#282828] border border-[#4A4640] rounded-xs text-xs text-[#B3A99A]">
                Public statement view. Connect the client or provider wallet to interact.
              </div>
            )}

            {txError && (
              <div className="mt-3 p-2 bg-[#E8A27E]/10 border border-[#E8A27E]/30 text-[#E8A27E] text-[11px] rounded-xs">
                {txError}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Confirmation Modals for Irreversible Actions */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Panel tone="sheet" className="max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#EDE6DC]">
              {confirmModal === "reclaim"
                ? `Reclaim ${formatEther(agreement.balance)} BOT?`
                : confirmModal === "release"
                ? `Release ${formatEther(agreement.balance)} BOT Early?`
                : "Serve Notice to Reclaim?"}
            </h3>

            <p className="text-xs text-[#B3A99A] leading-relaxed">
              {confirmModal === "reclaim"
                ? `The notice period has elapsed. This will reclaim the unspent ${formatEther(agreement.balance)} BOT back to your wallet and close the agreement.`
                : confirmModal === "release"
                ? `This will immediately transfer the unspent ${formatEther(agreement.balance)} BOT into the client's pending balance and close the retainer.`
                : `After ${Number(agreement.noticePeriod) / 86400} days you can reclaim whatever is left. The provider can keep drawing until then.`}
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmModal(null)}>
                Cancel
              </Button>
              <Button
                variant={confirmModal === "release" ? "danger" : "primary"}
                size="sm"
                onClick={() => {
                  const act = confirmModal;
                  setConfirmModal(null);
                  if (act === "reclaim") {
                    executeAction("reclaim", "reclaim", [id]);
                  } else if (act === "release") {
                    executeAction("release", "release", [id]);
                  } else if (act === "giveNotice") {
                    executeAction("giveNotice", "giveNotice", [id]);
                  }
                }}
              >
                Confirm
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
