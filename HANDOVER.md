# Handover: Retainer (`retainer-botchain`)

**Date:** 2026-10-25  
**Project:** 14 of 15 (Batch 3 Active)  
**Slug:** `retainer`  
**Archetype:** T · Statement (Graphite `#2B2B2B`, Surface `#353535`, Bone Ink `#EDE6DC`, Copper `#D4895C`, Credit `#8CCB9B`, Fonts: `Albert_Sans`, `Ubuntu_Mono`)

---

## 1. Deliverables Summary

### Contract Layer (`contracts/src/Retainer.sol`)
- **Committed Funds with Itemized Memos**:
  - `open(provider, noticePeriod, scope)`: Client deposits committed funds up to uint128 max, assigns provider, sets notice requirement (1 to 90 days), and documents engagement scope (up to 140 bytes).
  - `draw(id, amount, memo)`: The One Transaction. Provider draws up to the remaining balance at any time, emitting an itemized memo log (up to 100 bytes). Works through active notice periods.
  - `topUp(id)`: Client can add additional funds to an open agreement without resetting an active notice timer.
  - `giveNotice(id)`: Client serves notice, starting the countdown to reclaim unspent funds.
  - `cancelNotice(id)`: Client can cancel notice, resetting the timer.
  - `reclaim(id)`: Client reclaims the unspent balance once the notice period has fully elapsed.
  - `release(id)`: Provider can release remaining funds early, crediting `pending[client]`.
  - `withdraw()`: Client collects pending funds credited from early releases.
  - `agreementOf(id)`: View helper returning complete agreement state and effective notice timestamp.
  - `agreementsFor(who, offset, count)`: Paginated query returning newest agreements where `who` is client or provider.
- **Safety Invariants**:
  - `invariant_BalanceEqualsOpenPlusPending`: contract balance equals sum of active agreement balances plus sum of all pending credits.
  - Conservation over arbitrary fuzz sequences of open, topUp, multiple draws, notice, reclaim, and early release.
  - `nonReentrant` state protection on all value-bearing external calls (`draw`, `reclaim`, `withdraw`).

### Test Suites
- **Foundry (`contracts/test/Retainer.t.sol`)**:
  - 21 test cases passing (0 failures, 256 fuzz runs, balance invariant passed) covering all guards, zero amounts, address checks, boundary notice lengths, memo & scope limits, reentrant provider & client attacks, and gas ceilings.
- **Unit Tests (`lib/__tests__/`)**:
  - 64 tests passing across 11 test files (`retainer.test.ts`, `errors.test.ts`, `contract-limits.test.ts`, `abi-matches-contract.test.ts`, `wallet.test.ts`, `amount.test.ts`, `chain.test.ts`, `active-chain.test.ts`, `wagmi-chains.test.ts`, `deployment.test.ts`, and `hook-deps.test.ts`).
- **Integration Tests (`test/integration/retainer.test.ts`)**:
  - 15 integration tests passing across 2 test files on Anvil port 8614 (chain 968) testing complete lifecycle: contract deployment, constants verification, open, top-up, itemized draws, notice lifecycle, cancellation, provider draws during notice, post-notice reclaim, early release, pending withdrawal, statement reconstruction parity with contract balance, and pagination.

### Frontend Application
- **Pages**:
  - `/`: Overview listing retainers grouped into *As Client* and *As Provider* tables with notice status badges and direct ID statement lookup.
  - `/new`: Form to open a new retainer with provider address validator, scope input with live byte counter, notice duration presets, deposit input, plain-sentence summary, and settled-ref transaction handling.
  - `/r/[id]`: Full bank statement view with Letterhead band (`RET-XXXX`), From → To copper arrow, Figure strip (`Balance`, `Drawn to date`, `Notice`), action controls sidebar with draw form, top-up, notice actions, and zebra-striped Statement Table.
- **Design Archetype T · Statement**:
  - Warm graphite ground `#2B2B2B`, paper surface `#353535`, bone ink `#EDE6DC`, copper accent `#D4895C`.
  - Albert Sans UI headings and Ubuntu Mono tabular figures.
  - Passes distinctness check with 0 problems against 29 projects.

---

## 2. Verification Gates Execution

| Gate | Command | Status |
|---|---|---|
| 1. Contracts | `cd contracts && forge build --force && forge test -vv` | **PASS** (21 tests, 0 failures, 256 fuzz runs, balance invariant passed) |
| 2. TypeScript | `npm run typecheck` | **PASS** (0 errors) |
| 3. Unit & Lint | `npm test` | **PASS** (11 test files, 64 tests passed) |
| 4. Integration | `npm run test:integration` | **PASS** (15 integration tests passed on port 8614) |
| 5. Build | `npm run build` | **PASS** (Turbopack production build succeeded) |
| 6. Distinctness | `python3 ../scripts/check-distinct.py retainer` | **PASS** (29 projects compared, 0 conflicts) |

---

## 3. Handover Status

Retainer is complete, thoroughly tested, verified against all architectural and distinctness requirements, and ready for deployment.
