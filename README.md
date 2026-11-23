# bounty-entrants-02 — Sponsored Paid-Bounty Portfolio & Validator

[![make.fun bounty-entrants-02](https://make.fun/badge/bounty-entrants-02.svg)](https://make.fun/bounty/bounty-entrants-02)

Entry repository for the make.fun competition **[Get the most paying entrants across the bounties you launch on make.fun](https://make.fun/bounty/bounty-entrants-02)** (`2026-11-23T07:30:00Z` – `2026-11-24T07:30:00Z`, $250 prize pool shared by top 50).

> Before submitting via GitHub, add your repository's live rank and reward badges (`https://make.fun/badge/bounty-entrants-02/<owner>/<repo>/rank.svg` and `reward.svg`), set GitHub About website to `https://make.fun/bounty/bounty-entrants-02`, and add the `makefun` topic.

## Strategy & Sponsor Portfolio

Because the `bounty-entrants-02` window is **24 hours**, listing speed and entry friction dominate total counted paying entrants:

- **Live sponsor limits (`GET /api/sponsor/terms`, `2026-11-21.draft-6`)**:
  - `min_prize_usd`: `$5` USDC (`mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, Solana mainnet)
  - `min_pot_fee_multiple`: `5` (for a `$5` prize pool, entry fee can be `$0.50`–`$1.00`)
  - `max_open`: `3` concurrent bounties, `max_per_day`: `3` proposals per UTC day
  - `fee_house_percent`: `15%`, `min_creator_percent`: `15%`, `max_creator_percent`: `50%`
  - Fast listing tracks: `auto_list` (`5` min lead), `setup: "self"` text (`35` min), `setup: "self"` image (`65` min)
- **3-Bounty Portfolio (`$15 USDC` total escrow, `$0.50` entry fee each, `15%` creator share → `70%` pot growth)**:
  1. `proposals/bounty-1-memecoin-sprint.json` — **6-Hour Solana Memecoin Sprint** (`auto_list`, `pumpfun-replay` / `pumpfun-forward-6h`, opens ~5 min after deposit)
  2. `proposals/bounty-2-smart-fridge-apology.json` — **The Smart Fridge Apologizes** (`self_text`, 5-minute creative writing entry, opens ~35 min after funding)
  3. `proposals/bounty-3-frog-jazz-cover.json` — **Frog Jazz Album Cover** (`self_image`, shareable visual art entry, opens ~65 min after funding)

Why this mix works:
- Maximizes `max_open = 3` and `max_per_day = 3` inside the 24-hour window without risking slow custom-brief review delays.
- Sets the minimum eligible entry fee (`$0.50`) and minimum creator share (`15%`) so `$0.34–$0.35` of every fee flows directly into the prize pool—growing both entrant appeal and the `pot_usd` tie-breaker.
- Spans three distinct skill verticals (trading bots, writing, visual art) so distinct entrants can enter multiple bounties (one person entering two of your bounties counts in each).

## Repository Layout

- `main.ts` — Node 22+ standard-library-only entrypoint. Validates `BOUNTY.json` deterministically (no network, no wall clock) and writes byte-for-byte identical output to `${MAKEFUN_OUTPUT_DIR}/BOUNTY.json` with silent stdout.
- `BOUNTY.json` — Registry of approved public make.fun bounty URLs counted for this entry.
- `.makefun/owner.json` — Ownership claim file naming your linked Solana wallet base58 address.
- `LICENSE` — MIT License (`SPDX-License-Identifier: MIT`).
- `src/bounty-validator.ts` — Pure deterministic mirror of `makefun/bounty-gate/v2` and `makefun/bounty-counts/v2` validation, deduplication, BigInt cents scoring, and tie-break ordering.
- `src/sponsor-terms.ts` & `src/sponsor-planner.ts` — Typed live sponsor terms and portfolio economics/window auditor.
- `src/promotion-playbook.ts` — Organic promotion generator with automated anti-bought-entrants compliance checks (no fee refunds, cashbacks, external giveaways, or pay-per-entry promos).
- `proposals/*.json` — Sponsor proposal blueprints verified against live terms.
- `scripts/preflight.ts` — End-to-end local verifier (LICENSE, `main.ts` purity & 2-run determinism, `BOUNTY.json`, `.makefun/owner.json`, proposals, promotion compliance, and `README.md` badge).
- `tests/bounty-entry.test.ts` — Automated `node:test` suite (zero external dependencies).

## Local Run & Verification

Run `main.ts` the way the grader does:

```bash
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
cmp -s BOUNTY.json out/BOUNTY.json && echo "Byte-for-byte match"
```

Run the full test suite and preflight checks:

```bash
node --test tests/bounty-entry.test.ts
node scripts/preflight.ts
```

## Operator Steps to Launch & Submit Live Bounties

1. **Authenticate & link Solana wallet** (holding at least `$15 USDC` + small SOL for Solana mainnet escrow fees):
   ```bash
   node ../bounty-entrants-02-kit/cli/makefun.mjs login --origin https://make.fun
   ```
2. **Propose & fund the 3 fast-listing bounties** via `https://make.fun/sponsor/new` or `makefun sponsor suggest --idea <idea_id> --wait` + `sponsor submit` + `sponsor check` + `sponsor deposit` (sign each deposit in your wallet; never share private keys or seed phrases).
3. **Record live addresses & owner wallet**:
   - Update `BOUNTY.json` with the exact approved public URLs (`https://make.fun/bounty/<slug>`).
   - Update `.makefun/owner.json` with your linked Solana wallet's base58 public address.
   - Commit the changes.
4. **Promote organically**: Share direct bounty links across developer, AI agent, and creator communities (reach-only promotion; never refund fees or pay per entry).
5. **Bundle transcripts, check, and submit** from the unpacked kit directory:
   ```bash
   node cli/makefun.mjs bundle --repo ../repo --effort high --out transcripts.tar.gz
   node cli/makefun.mjs check --kit . --repo ../repo --transcripts transcripts.tar.gz
   node cli/makefun.mjs submit --competition bounty-entrants-02 --repo-url https://github.com/<owner>/<repo> --commit <sha> --title "Fast-Listing 3-Bounty Paid Portfolio" --bundle transcripts.tar.gz --keypair wallet.json
   ```
