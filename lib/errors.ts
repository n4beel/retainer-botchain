import { BaseError, ContractFunctionRevertedError, formatEther, type Address } from "viem";

export interface RevertDetails {
  errorName?: string;
  args?: readonly unknown[];
}

export function shortAddress(addr?: string): string {
  if (!addr) return "0x…";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatNoticeDate(timestamp: number | bigint): string {
  const ts = Number(timestamp);
  if (isNaN(ts) || ts <= 0) return "the scheduled date";
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

export function extractRevert(err: unknown): RevertDetails | undefined {
  if (typeof err !== "object" || err === null) return undefined;

  // Direct property check (e.g. test payloads or mocked errors)
  if (
    "data" in err &&
    (err as any).data &&
    typeof (err as any).data === "object" &&
    (err as any).data.errorName
  ) {
    return {
      errorName: (err as any).data.errorName,
      args: (err as any).data.args,
    };
  }
  if ("errorName" in err && typeof (err as any).errorName === "string") {
    return {
      errorName: (err as any).errorName,
      args: (err as any).args,
    };
  }

  // Viem BaseError walk
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => {
      if (e instanceof ContractFunctionRevertedError) return true;
      if (
        typeof e === "object" &&
        e !== null &&
        "data" in e &&
        Boolean((e as { data?: { errorName?: string } }).data?.errorName)
      ) {
        return true;
      }
      return false;
    });

    if (reverted) {
      if (reverted instanceof ContractFunctionRevertedError) {
        return {
          errorName: reverted.data?.errorName,
          args: reverted.data?.args,
        };
      }
      const errorObj = reverted as any;
      if (errorObj.data?.errorName) {
        return {
          errorName: errorObj.data.errorName,
          args: errorObj.data.args,
        };
      }
    }
  }

  return undefined;
}

/**
 * Maps custom contract errors and wallet issues to clear sentences (§4.4).
 */
export function describeError(err: unknown): string {
  if (!err) return "Transaction failed.";

  // User rejection
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("user rejected") || msg.includes("user denied") || msg.includes("cancelled")) {
      return "Transaction was cancelled in wallet.";
    }
  }

  const revert = extractRevert(err);
  if (revert?.errorName) {
    const args = revert.args ?? [];
    switch (revert.errorName) {
      case "InsufficientBalance": {
        const b = args[0] !== undefined ? formatEther(BigInt(args[0] as string | number | bigint)) : "0";
        const r = args[1] !== undefined ? formatEther(BigInt(args[1] as string | number | bigint)) : "0";
        return `The retainer holds ${b} BOT; you asked for ${r}.`;
      }
      case "NoticeNotServed": {
        const t = args[1] !== undefined ? Number(args[1] as string | number | bigint) : 0;
        return `You can reclaim from ${formatNoticeDate(t)}.`;
      }
      case "NoNotice": {
        return "Give notice first — it starts the clock.";
      }
      case "NoticeAlreadyGiven": {
        return "Notice has already been given.";
      }
      case "NotProvider": {
        return "Only the provider can do that.";
      }
      case "NotClient": {
        return "Only the client can do that.";
      }
      case "NotOpen": {
        return "This retainer is closed.";
      }
      case "MemoTooLong": {
        const l = args[0] !== undefined ? String(args[0]) : "0";
        const m = args[1] !== undefined ? String(args[1]) : "100";
        return `Memos run to ${m} bytes; yours is ${l}.`;
      }
      case "BadNotice": {
        return "Choose a notice period between 1 and 90 days.";
      }
      case "NothingToWithdraw": {
        return "Nothing to collect.";
      }
      case "BadParty": {
        return "Counterparty cannot be yourself or zero address.";
      }
      case "ZeroAmount": {
        return "Set an amount above zero.";
      }
      case "AmountTooLarge": {
        return "Amount exceeds the maximum allowed value.";
      }
      case "ScopeTooLong": {
        return "Scope description exceeds the limit of 140 bytes.";
      }
      case "NoSuchAgreement": {
        return "Retainer agreement does not exist.";
      }
      case "TransferFailed": {
        return "BOT transfer failed.";
      }
      default:
        return `Contract error: ${revert.errorName}`;
    }
  }

  if (err instanceof BaseError) {
    return err.shortMessage || err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }

  return "Transaction failed.";
}
