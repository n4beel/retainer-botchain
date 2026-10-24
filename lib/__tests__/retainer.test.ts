import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import {
  buildStatement,
  canDraw,
  maxDraw,
  noticeState,
  reference,
  validateMemo,
  validateScope,
  type RawRetainerLog,
} from "../retainer";

describe("Retainer helper functions", () => {
  it("formats agreement references with 4-digit zero padding", () => {
    expect(reference(1)).toBe("RET-0001");
    expect(reference(7n)).toBe("RET-0007");
    expect(reference(42)).toBe("RET-0042");
    expect(reference(1234)).toBe("RET-1234");
  });

  describe("noticeState evaluation", () => {
    it("returns 'none' if notice was never started", () => {
      expect(noticeState({ noticeStartedAt: 0n, noticeEffectiveAt: 0n })).toBe("none");
    });

    it("returns 'pending' if current time is before noticeEffectiveAt", () => {
      const now = 1_000_000;
      expect(
        noticeState(
          { noticeStartedAt: 900_000, noticeEffectiveAt: 1_100_000 },
          now
        )
      ).toBe("pending");
    });

    it("returns 'elapsed' if current time is at or after noticeEffectiveAt", () => {
      const now = 1_100_000;
      expect(
        noticeState(
          { noticeStartedAt: 900_000, noticeEffectiveAt: 1_100_000 },
          now
        )
      ).toBe("elapsed");

      expect(
        noticeState(
          { noticeStartedAt: 900_000, noticeEffectiveAt: 1_050_000 },
          now
        )
      ).toBe("elapsed");
    });
  });

  describe("canDraw and maxDraw", () => {
    const provider = "0x1111111111111111111111111111111111111111";
    const stranger = "0x2222222222222222222222222222222222222222";

    it("allows provider to draw when open with positive balance", () => {
      expect(
        canDraw({ state: 0, provider, balance: parseEther("1.0") }, provider)
      ).toBe(true);
    });

    it("rejects non-providers or closed retainers or zero balance", () => {
      expect(
        canDraw({ state: 0, provider, balance: parseEther("1.0") }, stranger)
      ).toBe(false);
      expect(
        canDraw({ state: 1, provider, balance: parseEther("1.0") }, provider)
      ).toBe(false);
      expect(
        canDraw({ state: 0, provider, balance: 0n }, provider)
      ).toBe(false);
    });

    it("returns exact balance for maxDraw", () => {
      expect(maxDraw({ balance: parseEther("5.5") })).toBe(parseEther("5.5"));
    });
  });

  describe("memo and scope validation", () => {
    it("validates memo required and <= 100 bytes", () => {
      expect(validateMemo("").ok).toBe(false);
      expect(validateMemo("A valid invoice memo").ok).toBe(true);
      expect(validateMemo("A".repeat(100)).ok).toBe(true);
      expect(validateMemo("A".repeat(101)).ok).toBe(false);

      // Multibyte characters (e.g. emoji: 4 bytes each)
      const fourByteEmoji = "🎨"; // 4 bytes
      expect(validateMemo(fourByteEmoji.repeat(25)).ok).toBe(true); // 100 bytes
      expect(validateMemo(fourByteEmoji.repeat(26)).ok).toBe(false); // 104 bytes
    });

    it("validates scope <= 140 bytes", () => {
      expect(validateScope("Simple scope").ok).toBe(true);
      expect(validateScope("B".repeat(140)).ok).toBe(true);
      expect(validateScope("B".repeat(141)).ok).toBe(false);
    });
  });

  describe("buildStatement", () => {
    it("reconstructs statement rows with debits, credits, and running balance", () => {
      const logs: RawRetainerLog[] = [
        {
          eventName: "Opened",
          blockNumber: 100n,
          logIndex: 0,
          transactionHash: "0xaaa111",
          args: {
            id: 1n,
            client: "0xClient",
            provider: "0xProvider",
            noticePeriod: 604800n,
            amount: parseEther("5.0"),
            scope: "Design & UX overhaul",
          },
        },
        {
          eventName: "Drawn",
          blockNumber: 105n,
          logIndex: 0,
          transactionHash: "0xbbb222",
          args: {
            id: 1n,
            amount: parseEther("1.5"),
            balance: parseEther("3.5"),
            memo: "Wireframes deliverable",
          },
        },
        {
          eventName: "ToppedUp",
          blockNumber: 110n,
          logIndex: 0,
          transactionHash: "0xccc333",
          args: {
            id: 1n,
            amount: parseEther("2.0"),
            balance: parseEther("5.5"),
          },
        },
        {
          eventName: "Drawn",
          blockNumber: 115n,
          logIndex: 0,
          transactionHash: "0xddd444",
          args: {
            id: 1n,
            amount: parseEther("2.5"),
            balance: parseEther("3.0"),
            memo: "Interactive prototype",
          },
        },
        {
          eventName: "Reclaimed",
          blockNumber: 130n,
          logIndex: 0,
          transactionHash: "0xeee555",
          args: {
            id: 1n,
            amount: parseEther("3.0"),
          },
        },
      ];

      const statement = buildStatement(logs);
      expect(statement.rows.length).toBe(5);

      // Row 1: Open
      expect(statement.rows[0].type).toBe("open");
      expect(statement.rows[0].credit).toBe(parseEther("5.0"));
      expect(statement.rows[0].debit).toBe(null);
      expect(statement.rows[0].runningBalance).toBe(parseEther("5.0"));
      expect(statement.rows[0].memo).toContain("Design & UX overhaul");

      // Row 2: Draw 1
      expect(statement.rows[1].type).toBe("draw");
      expect(statement.rows[1].credit).toBe(null);
      expect(statement.rows[1].debit).toBe(parseEther("1.5"));
      expect(statement.rows[1].runningBalance).toBe(parseEther("3.5"));

      // Row 3: Top Up
      expect(statement.rows[2].type).toBe("topUp");
      expect(statement.rows[2].credit).toBe(parseEther("2.0"));
      expect(statement.rows[2].debit).toBe(null);
      expect(statement.rows[2].runningBalance).toBe(parseEther("5.5"));

      // Row 4: Draw 2
      expect(statement.rows[3].type).toBe("draw");
      expect(statement.rows[3].credit).toBe(null);
      expect(statement.rows[3].debit).toBe(parseEther("2.5"));
      expect(statement.rows[3].runningBalance).toBe(parseEther("3.0"));

      // Row 5: Reclaim
      expect(statement.rows[4].type).toBe("reclaim");
      expect(statement.rows[4].credit).toBe(null);
      expect(statement.rows[4].debit).toBe(parseEther("3.0"));
      expect(statement.rows[4].runningBalance).toBe(0n);

      // Final balance matches
      expect(statement.balance).toBe(0n);
    });

    it("reconstructs statement rows with early release", () => {
      const logs: RawRetainerLog[] = [
        {
          eventName: "Opened",
          blockNumber: 200n,
          logIndex: 0,
          args: { id: 2n, amount: parseEther("4.0"), scope: "Consulting" },
        },
        {
          eventName: "Drawn",
          blockNumber: 205n,
          logIndex: 0,
          args: { id: 2n, amount: parseEther("1.0"), memo: "Session 1" },
        },
        {
          eventName: "Released",
          blockNumber: 210n,
          logIndex: 0,
          args: { id: 2n, amount: parseEther("3.0") },
        },
      ];

      const statement = buildStatement(logs);
      expect(statement.rows.length).toBe(3);
      expect(statement.rows[2].type).toBe("release");
      expect(statement.rows[2].debit).toBe(parseEther("3.0"));
      expect(statement.balance).toBe(0n);
    });
  });
});
