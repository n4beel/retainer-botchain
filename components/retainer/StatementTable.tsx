"use client";

import React from "react";
import { formatEther } from "viem";
import type { StatementRow } from "@/lib/retainer";

interface StatementTableProps {
  rows: StatementRow[];
  currentBalance?: bigint;
}

export default function StatementTable({ rows, currentBalance }: StatementTableProps) {
  if (rows.length === 0) {
    return (
      <div className="border border-[#4A4640] bg-[#2E2E2E] p-8 text-center text-xs text-[#B3A99A]">
        No ledger transactions recorded yet.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto border border-[#4A4640] bg-[#2E2E2E]">
      <table className="w-full min-w-[640px] text-left text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-[#242424] text-[11px] font-semibold text-[#B3A99A] border-b border-[#4A4640]">
          <tr>
            <th className="py-2.5 px-3">Date / Block</th>
            <th className="py-2.5 px-3">Ref</th>
            <th className="py-2.5 px-3">Description / Memo</th>
            <th className="py-2.5 px-3 text-right">Debit (BOT)</th>
            <th className="py-2.5 px-3 text-right">Credit (BOT)</th>
            <th className="py-2.5 px-3 text-right">Balance (BOT)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isEven = idx % 2 === 0;
            const rowClass = isEven ? "statement-row-even" : "statement-row-odd";

            return (
              <tr
                key={`${row.reference}-${idx}`}
                className={`${rowClass} statement-row-hover transition-colors border-b border-[#3F3C36]/50 last:border-b-0`}
              >
                {/* Date / Block */}
                <td className="py-2 px-3 text-[#B3A99A] statement-mono text-[11px]">
                  {row.blockNumber ? `Block #${row.blockNumber}` : `#${idx + 1}`}
                </td>

                {/* Ref */}
                <td className="py-2 px-3 text-[#B3A99A] statement-mono text-[11px]">
                  {row.txHash ? (
                    <span title={row.txHash}>{row.reference}</span>
                  ) : (
                    row.reference
                  )}
                </td>

                {/* Memo */}
                <td className="py-2 px-3 text-[#EDE6DC] font-medium max-w-[260px] truncate">
                  {row.memo}
                </td>

                {/* Debit */}
                <td className="py-2 px-3 text-right">
                  {row.debit !== null ? (
                    <span className="amount-debit font-mono">
                      -{formatEther(row.debit)}
                    </span>
                  ) : (
                    <span className="text-[#555] font-mono">—</span>
                  )}
                </td>

                {/* Credit */}
                <td className="py-2 px-3 text-right">
                  {row.credit !== null ? (
                    <span className="amount-credit font-mono">
                      +{formatEther(row.credit)}
                    </span>
                  ) : (
                    <span className="text-[#555] font-mono">—</span>
                  )}
                </td>

                {/* Running Balance */}
                <td className="py-2 px-3 text-right font-mono font-medium text-[#EDE6DC]">
                  {formatEther(row.runningBalance)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
