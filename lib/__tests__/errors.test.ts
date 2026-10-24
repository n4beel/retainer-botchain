import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { describeError, formatNoticeDate, shortAddress } from "../errors";

describe("describeError mapping for Retainer", () => {
  it("formats shortAddress correctly", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
    expect(shortAddress(undefined)).toBe("0x…");
  });

  it("formats notice dates cleanly", () => {
    const formatted = formatNoticeDate(1760000000);
    expect(formatted).toBeTruthy();
    expect(formatted).not.toBe("the scheduled date");
  });

  it("handles InsufficientBalance error with arguments", () => {
    const err = {
      data: {
        errorName: "InsufficientBalance",
        args: [parseEther("2.5"), parseEther("3.5")],
      },
    };
    expect(describeError(err)).toBe("The retainer holds 2.5 BOT; you asked for 3.5.");
  });

  it("handles NoticeNotServed error with date", () => {
    const ts = 1760000000;
    const err = {
      data: {
        errorName: "NoticeNotServed",
        args: [1n, BigInt(ts)],
      },
    };
    expect(describeError(err)).toBe(`You can reclaim from ${formatNoticeDate(ts)}.`);
  });

  it("handles NoNotice error", () => {
    const err = {
      data: {
        errorName: "NoNotice",
        args: [1n],
      },
    };
    expect(describeError(err)).toBe("Give notice first — it starts the clock.");
  });

  it("handles NoticeAlreadyGiven error", () => {
    const err = {
      data: {
        errorName: "NoticeAlreadyGiven",
        args: [1n],
      },
    };
    expect(describeError(err)).toBe("Notice has already been given.");
  });

  it("handles NotProvider error", () => {
    const err = {
      data: {
        errorName: "NotProvider",
        args: [1n, "0x1234..."],
      },
    };
    expect(describeError(err)).toBe("Only the provider can do that.");
  });

  it("handles NotClient error", () => {
    const err = {
      data: {
        errorName: "NotClient",
        args: [1n, "0x1234..."],
      },
    };
    expect(describeError(err)).toBe("Only the client can do that.");
  });

  it("handles NotOpen error", () => {
    const err = {
      data: {
        errorName: "NotOpen",
        args: [1n, 1],
      },
    };
    expect(describeError(err)).toBe("This retainer is closed.");
  });

  it("handles MemoTooLong error", () => {
    const err = {
      data: {
        errorName: "MemoTooLong",
        args: [120n, 100n],
      },
    };
    expect(describeError(err)).toBe("Memos run to 100 bytes; yours is 120.");
  });

  it("handles BadNotice error", () => {
    const err = {
      data: {
        errorName: "BadNotice",
        args: [3600n],
      },
    };
    expect(describeError(err)).toBe("Choose a notice period between 1 and 90 days.");
  });

  it("handles NothingToWithdraw error", () => {
    const err = {
      data: {
        errorName: "NothingToWithdraw",
        args: [],
      },
    };
    expect(describeError(err)).toBe("Nothing to collect.");
  });

  it("handles user rejected error gracefully", () => {
    const err = new Error("User rejected the request.");
    expect(describeError(err)).toBe("Transaction was cancelled in wallet.");
  });
});
