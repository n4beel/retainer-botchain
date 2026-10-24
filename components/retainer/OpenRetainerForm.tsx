"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAddress, parseEther, type Address, type Hex } from "viem";
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
import { retainerAbi } from "@/lib/botchain/abi";
import { isBotChainId, type BotChainId } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { describeError, shortAddress } from "@/lib/errors";
import { reference, validateScope } from "@/lib/retainer";

type Stage = "idle" | "simulating" | "signing" | "confirming" | "confirmed" | "reverted";

interface NoticeOption {
  label: string;
  days: number;
  seconds: bigint;
}

const NOTICE_PRESETS: NoticeOption[] = [
  { label: "1 day", days: 1, seconds: 86400n },
  { label: "7 days", days: 7, seconds: 86400n * 7n },
  { label: "14 days", days: 14, seconds: 86400n * 14n },
  { label: "30 days", days: 30, seconds: 86400n * 30n },
  { label: "90 days", days: 90, seconds: 86400n * 90n },
];

export default function OpenRetainerForm() {
  const router = useRouter();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { toast } = useToast();

  const [provider, setProvider] = useState("");
  const [scope, setScope] = useState("");
  const [selectedNotice, setSelectedNotice] = useState<NoticeOption>(NOTICE_PRESETS[1]); // 7 days default
  const [amount, setAmount] = useState("");

  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const settledRef = useRef<Hex | null>(null);
  const routerRef = useRef(router);
  routerRef.current = router;
  const clientRef = useRef(publicClient);
  clientRef.current = publicClient;

  const { writeContractAsync } = useWriteContract();
  const { data: receipt, isSuccess, isError, error: receiptError } =
    useWaitForTransactionReceipt({ hash: txHash ?? undefined });

  // Handle transaction confirmation
  useEffect(() => {
    if (!txHash || settledRef.current === txHash) return;

    if (isSuccess && receipt) {
      settledRef.current = txHash;
      setStage("confirmed");

      // Extract agreement id from Opened event
      for (const log of receipt.logs) {
        try {
          if (log.topics[0] && log.topics[1]) {
            const id = BigInt(log.topics[1]);
            setCreatedId(id);
            break;
          }
        } catch {
          // continue
        }
      }

      toast(
        "success",
        "Retainer opened",
        "Agreement created and initial deposit funded."
      );
    } else if (isError) {
      settledRef.current = txHash;
      setStage("reverted");
      setErrorMessage(describeError(receiptError));
    }
  }, [txHash, isSuccess, isError, receipt, receiptError, toast]);

  const scopeValidation = useMemo(() => validateScope(scope), [scope]);

  const isValidProvider = useMemo(() => {
    if (!provider || !isAddress(provider)) return false;
    if (address && provider.toLowerCase() === address.toLowerCase()) return false;
    return true;
  }, [provider, address]);

  const isValidAmount = useMemo(() => {
    try {
      const val = parseEther(amount);
      return val > 0n;
    } catch {
      return false;
    }
  }, [amount]);

  const canSubmit =
    stage === "idle" &&
    isValidProvider &&
    scopeValidation.ok &&
    isValidAmount &&
    Boolean(address) &&
    isBotChainId(chainId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address || !isBotChainId(chainId)) return;

    setErrorMessage(null);
    setStage("simulating");

    try {
      const deployment = getDeployment(chainId as BotChainId);
      const contractAddress = deployment?.address;
      if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error("Retainer contract not deployed on this network.");
      }

      const depositValue = parseEther(amount);
      setStage("signing");

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: retainerAbi,
        functionName: "open",
        args: [provider as Address, selectedNotice.seconds, scope],
        value: depositValue,
      });

      setTxHash(hash);
      setStage("confirming");
    } catch (err) {
      setStage("idle");
      setErrorMessage(describeError(err));
    }
  }

  // stage === "confirmed" rendered FIRST
  if (stage === "confirmed") {
    return (
      <Panel tone="sheet" className="max-w-xl mx-auto text-center py-10">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xs bg-[#D4895C]/20 text-[#D4895C]">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-[#EDE6DC]">Retainer Agreement Established</h2>
        <p className="mt-2 text-xs text-[#B3A99A]">
          Reference: <span className="font-mono text-[#D4895C]">{createdId ? reference(createdId) : "RET-…"}</span>
        </p>
        <p className="mt-1 text-xs text-[#B3A99A]">
          Deposit of {amount} BOT funded to {shortAddress(provider)}.
        </p>

        <div className="mt-6 flex justify-center gap-3">
          {createdId && (
            <Link href={`/r/${createdId}`}>
              <Button variant="primary">View Statement</Button>
            </Link>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setStage("idle");
              setTxHash(null);
              setCreatedId(null);
              setProvider("");
              setScope("");
              setAmount("");
            }}
          >
            Open Another
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel tone="sheet" className="max-w-2xl mx-auto">
      <div className="border-b border-[#4A4640] pb-3 mb-5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 bg-[#D4895C]" />
          <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-[#EDE6DC]">
            New Retainer Agreement
          </h2>
        </div>
        <p className="mt-1 text-xs text-[#B3A99A]">
          Fund a committed balance that the provider draws against as work progresses.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Provider Address */}
        <div>
          <label className="block text-xs font-medium text-[#EDE6DC] mb-1.5">
            Provider Address (Beneficiary)
          </label>
          <input
            type="text"
            value={provider}
            onChange={(e) => setProvider(e.target.value.trim())}
            placeholder="0x…"
            className="w-full bg-[#282828] border border-[#4A4640] rounded-xs px-3 py-2 text-xs font-mono text-[#EDE6DC] focus:outline-none focus:border-[#D4895C]"
          />
          {provider && !isValidProvider && (
            <p className="mt-1 text-[11px] text-[#E8A27E]">
              {address && provider.toLowerCase() === address.toLowerCase()
                ? "Provider cannot be your own address."
                : "Enter a valid 0x EVM address."}
            </p>
          )}
        </div>

        {/* Scope of Work */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-medium text-[#EDE6DC]">
              Scope / Engagement Terms
            </label>
            <span
              className={`text-[11px] font-mono ${
                scopeValidation.ok ? "text-[#B3A99A]" : "text-[#E8A27E]"
              }`}
            >
              {scopeValidation.byteLength}/140 bytes
            </span>
          </div>
          <textarea
            rows={2}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="e.g. Full-stack product engineering sprint & code review"
            className="w-full bg-[#282828] border border-[#4A4640] rounded-xs px-3 py-2 text-xs text-[#EDE6DC] focus:outline-none focus:border-[#D4895C]"
          />
          {!scopeValidation.ok && scopeValidation.error && (
            <p className="mt-1 text-[11px] text-[#E8A27E]">{scopeValidation.error}</p>
          )}
        </div>

        {/* Notice Period */}
        <div>
          <label className="block text-xs font-medium text-[#EDE6DC] mb-1.5">
            Notice Period (Required to reclaim unspent balance)
          </label>
          <div className="grid grid-cols-5 gap-2">
            {NOTICE_PRESETS.map((preset) => {
              const isSelected = selectedNotice.days === preset.days;
              return (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => setSelectedNotice(preset)}
                  className={`py-2 px-1 text-center text-xs font-mono rounded-xs border transition-colors ${
                    isSelected
                      ? "border-[#D4895C] bg-[#D4895C]/15 text-[#D4895C] font-bold"
                      : "border-[#4A4640] bg-[#282828] text-[#B3A99A] hover:text-[#EDE6DC]"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-[#B3A99A]">
            The provider can draw against funds during this window. Reclaim unlocks once elapsed.
          </p>
        </div>

        {/* Opening Deposit */}
        <div>
          <label className="block text-xs font-medium text-[#EDE6DC] mb-1.5">
            Opening Deposit (BOT)
          </label>
          <div className="relative">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full bg-[#282828] border border-[#4A4640] rounded-xs pl-3 pr-14 py-2 text-xs font-mono text-[#EDE6DC] focus:outline-none focus:border-[#D4895C]"
            />
            <div className="absolute inset-y-0 right-3 flex items-center text-xs font-mono text-[#B3A99A] pointer-events-none">
              BOT
            </div>
          </div>
        </div>

        {/* Consequence Summary Sentence */}
        <div className="p-3 bg-[#242424] border border-[#4A4640] rounded-xs text-xs text-[#B3A99A] leading-relaxed">
          <span className="font-semibold text-[#EDE6DC]">Summary: </span>
          You are depositing {amount ? `${amount} BOT` : "funds"} with{" "}
          {isValidProvider ? shortAddress(provider) : "the provider"}. The provider can draw
          against this balance at any time with an itemized memo. To reclaim unspent funds, you
          must give {selectedNotice.label} notice.
        </div>

        {errorMessage && (
          <div className="p-3 bg-[#E8A27E]/10 border border-[#E8A27E]/40 text-[#E8A27E] text-xs rounded-xs">
            {errorMessage}
          </div>
        )}

        <Button
          type="submit"
          disabled={!canSubmit}
          loading={stage === "simulating" || stage === "signing" || stage === "confirming"}
          className="w-full py-2.5"
        >
          {stage === "signing"
            ? "Sign in Wallet…"
            : stage === "confirming"
            ? "Confirming on BOT Chain…"
            : "Deposit Retainer"}
        </Button>
      </form>
    </Panel>
  );
}
