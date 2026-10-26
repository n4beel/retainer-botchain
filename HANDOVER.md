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

---

## Feedback round 1

All items from `docs/specs/FEEDBACK-retainer.md` addressed and verified.

### Items Fixed

1. **Item 1: Corrected Statement Limit Disclaimer Label (`Fixed`)**:
   - In `components/retainer/RetainerStatementView.tsx`, changed the misleading prefix from `Ledger integrity:` to `Limit:`, accurately introducing the statement rule that the provider can draw any amount up to the balance at any time while the client's protection is the notice period.

2. **Item 2: Decoded `Opened` Event By Name (`Fixed`)**:
   - In `components/retainer/OpenRetainerForm.tsx`, eliminated raw `log.topics[1]` indexing. Replaced with `parseEventLogs({ abi: retainerAbi, logs: receipt.logs, eventName: "Opened" })` to robustly extract `id` from the typed event log args.

3. **Item 3 & 4: Local Stack Time Alignment & Bohr Testnet Configuration (`Fixed`)**:
   - Updated `scripts/local-stack.mjs` to calculate total time warp (10 days = 864,000s) and start Anvil with `--timestamp (now - TOTAL_WARP)`. Only warped forward so final block timestamp is within 0s of host wall-clock time (asserted `<= 120s`).
   - Adjusted scenario 3 notice period to 13 days so exactly 3 days remain after 10 days of warp.
   - Wrote `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet` and `NEXT_PUBLIC_BOHR_RPC=http://127.0.0.1:8714` into `.env.local`.
   - Added formatted Account Role Table and scenario manifest printout to console output.

4. **Item 5: Real Browser Walkthrough with Mock Wallet (`Fixed`)**:
   - Performed browser walkthrough using headless Chrome and `docs/specs/tools/mock-wallet.js` across responsive viewports (360px, 720px, 1280px) and all routes from §3.2.
   - Verified 0 console errors and 0 hydration warnings.

### Browser Walkthrough Results

| Route | Role | Action | Status | Details |
|---|---|---|---|---|
| `/` | Acc 0 (Client & Provider) | List retainers in client & provider tables | **PASS** | 6 agreements rendered across client and provider tables |
| `/r/1` | Acc 1 (Provider) | Draw 0.2 BOT with memo itemization | **PASS** | Transaction confirmed on chain; itemized row appended to statement table |
| `/r/1` | Acc 0 (Client) | Top up 0.5 BOT to retainer balance | **PASS** | Top up confirmed on chain; credit row added and balance augmented |
| `/r/2` | Acc 0 (Client) | Reclaim unspent funds after notice elapsed | **PASS** | Confirmation modal states exact amount; unspent funds returned to client wallet; agreement closed |
| `/r/3` | Acc 0 (Client) | View notice countdown and cancel notice option | **PASS** | Displays Reclaimable countdown based on wall-clock time; Cancel Notice button available |
| `/r/6` | Acc 0 (Client) | Withdraw released pending balance | **PASS** | Client claims funds released early by provider; pull-payment executed safely |
| `/new` → `/r/7` | Acc 0 (Client) | Open new retainer agreement (1.0 BOT, 7 days notice) | **PASS** | Decoded Opened event by name; stage===confirmed rendered first with View Statement link |
| `/r/5` | Observer (No Wallet) | View public statement with corrected Limit: note | **PASS** | Read-only statement public; displays zebra table and corrected Limit: label |

**Console Errors:** 0  
**Hydration Warnings:** 0

## Feedback round 2

1. **Local-stack autonomous mining (`--block-time 1`):**
   - Configured `anvil` in `scripts/local-stack.mjs` with `--block-time 1` to produce blocks autonomously on a 1-second cadence.
   - Seeded states across all 6 scenarios (active retainer with 4 draws and top-up, notice served and elapsed, notice served with 3 days left, provider retainer with 1 draw, reclaimed retainer, released retainer with client refund) verified.
   - Final chain timestamp matches wall clock (`diff: 0s`, within 120s limit).
   - Confirmed autonomous block progression without manual mining:
     ```bash
     b1=$(cast block-number --rpc-url http://127.0.0.1:8714); sleep 3; b2=$(cast block-number --rpc-url http://127.0.0.1:8714); echo "$b1 -> $b2"
     # Output: 101 -> 104
     ```

## Feedback round 3

1. **Footer three-link compliance (Item 1 & Item 2):**
   - Added `BOTCHAIN_SITE_URL = "https://botchain.ai"` and `BOTCHAIN_EXPLORER_URL = "https://scan.botchain.ai"` in `lib/botchain/chain.ts`.
   - Added exported helper `footerLinks(chainId?: number): FooterLinks` returning `{ contract, site, explorer }` in `lib/botchain/chain.ts` and re-exported from `lib/botchain/deployment.ts`.
   - Updated `components/botchain/BuiltOnBotChain.tsx` to consume `footerLinks()`.
   - Updated `components/layout/PageShell.tsx` to render all three required links: contract on explorer (when deployed), `https://botchain.ai`, and `https://scan.botchain.ai` in Retainer's ledger aesthetic.
   - Created `app/not-found.tsx` wrapped in `PageShell` ensuring the footer is present on 404 pages.
   - Added unit test suite in `lib/botchain/__tests__/chain.test.ts` testing chain IDs 677 and 968 for deployed and undeployed configurations.
   - Added `.netlify/` to `.gitignore`.

2. **Browser / Route Verification (Item 3):**
   - Verified local stack on port 8714 (Anvil) and port 3014 (Next.js):
     - `/` (Home): 200 OK — contains contract link, `https://botchain.ai`, and `https://scan.botchain.ai`.
     - `/r/1` (Retainer Detail): 200 OK — contains contract link, `https://botchain.ai`, and `https://scan.botchain.ai`.
     - `/nonexistent` (Not Found 404): 404 Not Found — contains contract link, `https://botchain.ai`, and `https://scan.botchain.ai`.

