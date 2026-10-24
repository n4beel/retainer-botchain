import type { Address, PublicClient } from "viem";
import { retainerAbi } from "./botchain/abi";
import { MAX_MEMO_BYTES, MAX_SCOPE_BYTES } from "./limits";

export type RetainerState = 0 | 1 | 2; // 0: Open, 1: Reclaimed, 2: Released

export interface RetainerAgreement {
  id: bigint;
  client: Address;
  provider: Address;
  noticePeriod: bigint;
  noticeStartedAt: bigint;
  noticeEffectiveAt: bigint;
  balance: bigint;
  totalDrawn: bigint;
  draws: number;
  state: RetainerState;
  createdBlock: number;
}

export type NoticeStatus = "none" | "pending" | "elapsed";

export interface StatementRow {
  timestamp?: number;
  blockNumber?: bigint;
  txHash?: string;
  reference: string;
  memo: string;
  debit: bigint | null;
  credit: bigint | null;
  runningBalance: bigint;
  type: "open" | "topUp" | "draw" | "reclaim" | "release";
}

export interface Statement {
  rows: StatementRow[];
  balance: bigint;
}

export interface RawRetainerLog {
  eventName: "Opened" | "ToppedUp" | "Drawn" | "Reclaimed" | "Released";
  args: {
    id?: bigint;
    client?: Address;
    provider?: Address;
    noticePeriod?: bigint;
    amount?: bigint;
    balance?: bigint;
    scope?: string;
    memo?: string;
    effectiveAt?: bigint;
  };
  blockNumber?: bigint;
  transactionHash?: string;
  logIndex?: number;
}

/** Formats an agreement ID as RET-0007 */
export function reference(id: bigint | number): string {
  const num = typeof id === "bigint" ? Number(id) : id;
  return `RET-${String(num).padStart(4, "0")}`;
}

/** Determines whether notice is none, pending, or elapsed */
export function noticeState(
  agreement: { noticeStartedAt: bigint | number; noticeEffectiveAt: bigint | number },
  now?: number
): NoticeStatus {
  const started = BigInt(agreement.noticeStartedAt);
  const effective = BigInt(agreement.noticeEffectiveAt);
  if (started === 0n || effective === 0n) return "none";

  const currentTime = BigInt(now ?? Math.floor(Date.now() / 1000));
  if (currentTime >= effective) return "elapsed";
  return "pending";
}

/** Determines if a caller can draw */
export function canDraw(
  agreement: { state: number; provider: string; balance: bigint },
  caller?: string
): boolean {
  if (agreement.state !== 0) return false;
  if (agreement.balance <= 0n) return false;
  if (!caller) return false;
  return agreement.provider.toLowerCase() === caller.toLowerCase();
}

/** Returns the maximum allowable draw */
export function maxDraw(agreement: { balance: bigint }): bigint {
  return agreement.balance;
}

/** Validates memo byte length */
export function validateMemo(memo: string): { ok: boolean; byteLength: number; error?: string } {
  const bytes = new TextEncoder().encode(memo);
  const len = bytes.length;
  if (len === 0) {
    return { ok: false, byteLength: 0, error: "Memo is required." };
  }
  if (BigInt(len) > MAX_MEMO_BYTES) {
    return {
      ok: false,
      byteLength: len,
      error: `Memo is ${len} bytes (max ${MAX_MEMO_BYTES}).`,
    };
  }
  return { ok: true, byteLength: len };
}

/** Validates scope byte length */
export function validateScope(scope: string): { ok: boolean; byteLength: number; error?: string } {
  const bytes = new TextEncoder().encode(scope);
  const len = bytes.length;
  if (BigInt(len) > MAX_SCOPE_BYTES) {
    return {
      ok: false,
      byteLength: len,
      error: `Scope is ${len} bytes (max ${MAX_SCOPE_BYTES}).`,
    };
  }
  return { ok: true, byteLength: len };
}

/**
 * Reconstructs the chronological statement rows and final running balance from event logs.
 */
export function buildStatement(logs: RawRetainerLog[]): Statement {
  const sorted = [...logs].sort((a, b) => {
    if (a.blockNumber && b.blockNumber && a.blockNumber !== b.blockNumber) {
      return a.blockNumber < b.blockNumber ? -1 : 1;
    }
    if (a.logIndex !== undefined && b.logIndex !== undefined) {
      return a.logIndex - b.logIndex;
    }
    return 0;
  });

  const rows: StatementRow[] = [];
  let runningBalance = 0n;

  for (let i = 0; i < sorted.length; i++) {
    const log = sorted[i];
    const ref = log.transactionHash
      ? `${log.transactionHash.slice(0, 8)}…`
      : `#${i + 1}`;

    switch (log.eventName) {
      case "Opened": {
        const amt = log.args.amount ?? 0n;
        runningBalance += amt;
        rows.push({
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          reference: ref,
          memo: log.args.scope ? `Opening deposit · ${log.args.scope}` : "Opening deposit",
          credit: amt,
          debit: null,
          runningBalance,
          type: "open",
        });
        break;
      }
      case "ToppedUp": {
        const amt = log.args.amount ?? 0n;
        runningBalance += amt;
        rows.push({
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          reference: ref,
          memo: "Deposit top-up",
          credit: amt,
          debit: null,
          runningBalance,
          type: "topUp",
        });
        break;
      }
      case "Drawn": {
        const amt = log.args.amount ?? 0n;
        runningBalance -= amt;
        rows.push({
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          reference: ref,
          memo: log.args.memo ? log.args.memo : "Draw against retainer",
          credit: null,
          debit: amt,
          runningBalance,
          type: "draw",
        });
        break;
      }
      case "Reclaimed": {
        const amt = log.args.amount ?? 0n;
        runningBalance -= amt;
        rows.push({
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          reference: ref,
          memo: "Notice elapsed · unspent balance reclaimed",
          credit: null,
          debit: amt,
          runningBalance,
          type: "reclaim",
        });
        break;
      }
      case "Released": {
        const amt = log.args.amount ?? 0n;
        runningBalance -= amt;
        rows.push({
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          reference: ref,
          memo: "Early release by provider · credited to pending",
          credit: null,
          debit: amt,
          runningBalance,
          type: "release",
        });
        break;
      }
    }
  }

  return { rows, balance: runningBalance };
}

/**
 * Loads all statement logs for an agreement id from createdBlock to latest.
 */
export async function loadStatement(
  publicClient: PublicClient,
  contractAddress: Address,
  id: bigint,
  fromBlock?: bigint
): Promise<Statement> {
  const events = ["Opened", "ToppedUp", "Drawn", "Reclaimed", "Released"] as const;
  const rawLogs: RawRetainerLog[] = [];

  for (const eventName of events) {
    try {
      const logs = await publicClient.getContractEvents({
        address: contractAddress,
        abi: retainerAbi,
        eventName: eventName as any,
        args: { id } as any,
        fromBlock: fromBlock && fromBlock > 0n ? fromBlock : "earliest",
        toBlock: "latest",
      });

      for (const log of logs) {
        rawLogs.push({
          eventName,
          args: (log as any).args,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
        });
      }
    } catch (e) {
      console.warn(`Could not load ${eventName} logs:`, e);
    }
  }

  return buildStatement(rawLogs);
}
