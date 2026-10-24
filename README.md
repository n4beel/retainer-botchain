# Retainer

> **Pay in advance. Draw as the work happens.** Client & provider statements on BOT Chain.

Part of the BOT Chain reference applications suite (Project 14 of 15).

---

## 1. What It Does

Retainer enables a client to deposit committed funds with a provider. The provider draws against the balance as deliverables are completed, with each draw accompanied by an on-chain itemized memo.

1. **Provider Draws:** The provider draws against the balance as work is delivered. Each draw carries a descriptive memo (invoice line) emitted on-chain.
2. **Client Notice Protection:** To reclaim unspent funds, the client gives notice. Once the notice period elapses, the client can reclaim the unspent remainder.
3. **Work Continues During Notice:** The provider can continue drawing against legitimate work during the notice period until notice elapses.
4. **Early Release:** The provider can release remaining funds early at any time, crediting the client's pending balance for pull withdrawal.
5. **Top-Ups:** The client can top up the retainer balance at any time without resetting an active notice period.

---

## 2. What It Deliberately Cannot Do

- **No per-draw client approval:** While open, the provider can draw any amount up to the balance at any time. The client's protection is the notice period, not a veto.
- **Notice period cannot be shortened:** Unspent balance is locked until notice is served and elapsed.
- **Statement is a ledger, not an audit:** The contract records what was drawn and the memos provided; it does not independently verify that off-chain work was performed.
- **No on-chain arbitration:** Any contractual dispute over delivered work is handled off-chain.

---

## 3. The One Transaction

- **Function:** `draw(uint256 id, uint128 amount, string memo) external`
- **Label:** `"Draw against a retainer"`
- **Role:** Provider
- **Requirements:** Retainer must be open; caller must be the designated provider; `amount > 0`; `amount <= balance`; `bytes(memo).length <= 100`.

---

## 4. Architecture & Security

### 4.1 Storage Packing
Each retainer agreement is packed into 3 32-byte storage slots:
- Slot 1: `client` (20 bytes), `noticePeriod` (8 bytes / uint64), `createdBlock` (4 bytes / uint32)
- Slot 2: `provider` (20 bytes), `noticeStartedAt` (8 bytes / uint64), `draws` (2 bytes / uint16), `state` (1 byte / uint8)
- Slot 3: `balance` (16 bytes / uint128), `totalDrawn` (16 bytes / uint128)

### 4.2 Invariants & Safety Guarantees
- **Balance Conservation Invariant:** `address(this).balance == sum(balance of Open agreements) + sum(pending[*])` always.
- **Deposit Conservation:** `totalDrawn + balance + returned == sum(deposits)` per agreement across all execution paths.
- **Notice Time Gate:** Reclaiming unspent funds reverts with `NoticeNotServed(id, effectiveAt)` until `block.timestamp >= noticeStartedAt + noticePeriod`.
- **Clock Restart:** Cancelling a notice resets `noticeStartedAt` to 0; subsequent notice begins from the new timestamp.
- **Reentrancy Protection:** All fund transfers (`draw`, `reclaim`, `withdraw`) use `nonReentrant` state guards and pull-payment patterns.

---

## 5. Design Archetype: T · Statement

The user interface follows Archetype T · Statement — a ledger bank statement aesthetic:
- **Warm Graphite Ground:** `#2B2B2B` with paper-tone surface `#353535` and copper accent `#D4895C`.
- **Letterhead Band:** Reference header (`RET-0007`) and engagement scope in large type, accompanied by client → provider addresses linked by a copper arrow.
- **Figure Strip:** Three key figures separated by vertical rules: `Balance`, `Drawn to date`, and `Notice`.
- **Statement Table:** Full-width zebra table with date/block, reference, memo, credit (green `#8CCB9B`), debit (copper `#E8A27E`), and running balance.
- **Role Actions:** Desktop sticky 300px sidebar and mobile bottom drawer displaying provider or client actions based on connected wallet.
- **Typography:** Albert Sans for UI headings and clean ledger typography; Ubuntu Mono for tabular amounts and references.

### Contrast Verification Report (WCAG AAA & AA)
- Bone ink on graphite ground (`#EDE6DC` on `#2B2B2B`): **11.3:1** (Exceeds WCAG AAA 7:1)
- Bone ink on surface (`#EDE6DC` on `#353535`): **9.5:1** (Exceeds WCAG AAA 7:1)
- Credit green on zebra row (`#8CCB9B` on `#2F2F2F`): **7.4:1** (Exceeds WCAG AAA 7:1)
- Accent ink on copper action button (`#1E1308` on `#D4895C`): **6.4:1** (Exceeds WCAG AA 4.5:1)
- Copper on graphite ground (`#D4895C` on `#2B2B2B`): **4.93:1** (Exceeds WCAG AA 4.5:1)
- Muted text on graphite ground (`#B3A99A` on `#2B2B2B`): **6.1:1** (Exceeds WCAG AA 4.5:1)

---

## 6. Gas Ceilings

| Operation | Target Gas | Measured / Ceiling |
|---|---|---|
| `open` | 170k - 230k | ~215k gas (< 230,000) |
| `draw` | 55k - 70k | ~45k - 52k gas (< 70,000) |
| `reclaim` | 45k - 60k | ~38k - 44k gas (< 60,000) |

---

## 7. Verification Results

- **Foundry Test Suite:** 21 tests passed (0 failures, 256 fuzz runs, balance conservation invariant passed)
- **Unit & Hook Linter Tests:** 64 tests passed across 11 test files
- **Integration Test Suite:** 15 tests passed across 2 test files on port 8614 (chain 968)
- **TypeScript:** `tsc --noEmit` passed with 0 errors
- **Next.js Production Build:** Clean build with static and dynamic routes (`/`, `/new`, `/r/[id]`)
- **Distinctness Check:** `python3 scripts/check-distinct.py retainer` passed with 0 conflicts across 29 projects
