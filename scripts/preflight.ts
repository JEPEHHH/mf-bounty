// Local preflight verifier for bounty-entrants-02 (Node 22+, stdlib only).
// Checks LICENSE, main.ts purity + 2-run determinism, BOUNTY.json schema,
// .makefun/owner.json presence, sponsor proposal blueprints, and organic promotion rules.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateBountyFileBuffer } from '../src/bounty-validator.ts';
import {
  auditPromotionCampaign,
  buildOrganicPromotionPlan,
} from '../src/promotion-playbook.ts';
import { auditPortfolio } from '../src/sponsor-planner.ts';
import type { SponsorProposalBlueprint } from '../src/sponsor-planner.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const BASE58_PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface CheckReport {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}

const reports: CheckReport[] = [];

function record(name: string, status: 'PASS' | 'WARN' | 'FAIL', detail: string): void {
  reports.push({ name, status, detail });
}

function checkLicense(): void {
  const licensePath = join(REPO_ROOT, 'LICENSE');
  try {
    const content = readFileSync(licensePath, 'utf8');
    if (/SPDX-License-Identifier:\s*(MIT|Apache-2\.0|BSD-3-Clause|ISC)/i.test(content)) {
      record('license_osi', 'PASS', 'Root LICENSE declares OSI-approved SPDX identifier');
    } else {
      record('license_osi', 'FAIL', 'Root LICENSE is missing SPDX-License-Identifier header');
    }
  } catch (err) {
    record('license_osi', 'FAIL', `Cannot read LICENSE: ${(err as Error).message}`);
  }
}

function checkMainPurityAndDeterminism(): void {
  const mainPath = join(REPO_ROOT, 'main.ts');
  const source = readFileSync(mainPath, 'utf8');

  const forbiddenPatterns = [
    { label: 'fetch/network', regex: /\bfetch\s*\(|node:http|node:https|node:net/ },
    { label: 'wall-clock Date', regex: /\bDate\.now\s*\(|\bnew\s+Date\b|performance\.now/ },
  ];

  for (const item of forbiddenPatterns) {
    if (item.regex.test(source)) {
      record('main_purity', 'FAIL', `main.ts contains forbidden ${item.label} reference`);
      return;
    }
  }
  record('main_purity', 'PASS', 'main.ts uses stdlib only with no network or wall-clock calls');

  const tmpBase = mkdtempSync(join(tmpdir(), 'bounty-entrants-02-preflight-'));
  const out1 = join(tmpBase, 'run1');
  const out2 = join(tmpBase, 'run2');

  try {
    const stdout1 = execFileSync(process.execPath, [mainPath], {
      env: { ...process.env, MAKEFUN_BOT_DIR: REPO_ROOT, MAKEFUN_OUTPUT_DIR: out1 },
      encoding: 'utf8',
    });
    const stdout2 = execFileSync(process.execPath, [mainPath], {
      env: { ...process.env, MAKEFUN_BOT_DIR: REPO_ROOT, MAKEFUN_OUTPUT_DIR: out2 },
      encoding: 'utf8',
    });

    if (stdout1.length > 0 || stdout2.length > 0) {
      record('main_determinism', 'FAIL', 'main.ts must not print to stdout on success');
      return;
    }

    const srcBytes = readFileSync(join(REPO_ROOT, 'BOUNTY.json'));
    const run1Bytes = readFileSync(join(out1, 'BOUNTY.json'));
    const run2Bytes = readFileSync(join(out2, 'BOUNTY.json'));

    if (!srcBytes.equals(run1Bytes) || !run1Bytes.equals(run2Bytes)) {
      record('main_determinism', 'FAIL', 'Two runs of main.ts did not match BOUNTY.json byte-for-byte');
      return;
    }

    record(
      'main_determinism',
      'PASS',
      `Two runs wrote identical ${run1Bytes.byteLength} bytes with silent stdout`
    );
  } catch (err) {
    record('main_determinism', 'FAIL', `main.ts execution failed: ${(err as Error).message}`);
  } finally {
    rmSync(tmpBase, { recursive: true, force: true });
  }
}

function checkBountyJson(): void {
  const bountyPath = join(REPO_ROOT, 'BOUNTY.json');
  const raw = readFileSync(bountyPath);
  const res = validateBountyFileBuffer(raw, { strictLive: true });

  if (!res.ok) {
    record('bounty_json', 'FAIL', res.errors.join('; '));
    return;
  }

  record(
    'bounty_json',
    'PASS',
    `${res.items.length} unique bounties valid (${res.bytes} bytes)`
  );
}

function checkOwnerClaimFile(): void {
  const ownerPath = join(REPO_ROOT, '.makefun', 'owner.json');
  try {
    const parsed = JSON.parse(readFileSync(ownerPath, 'utf8')) as { wallet?: unknown };
    if (typeof parsed.wallet !== 'string' || parsed.wallet.trim().length === 0) {
      record('owner_claim', 'FAIL', '.makefun/owner.json must contain a non-empty "wallet" string');
      return;
    }
    if (BASE58_PUBKEY_RE.test(parsed.wallet)) {
      record('owner_claim', 'PASS', `.makefun/owner.json names Solana wallet ${parsed.wallet}`);
    } else {
      record(
        'owner_claim',
        'WARN',
        '.makefun/owner.json holds a placeholder; replace with your linked Solana wallet base58 address before submitting'
      );
    }
  } catch (err) {
    record('owner_claim', 'FAIL', `Cannot parse .makefun/owner.json: ${(err as Error).message}`);
  }
}

function checkProposalsAndPromotion(): void {
  const proposalsDir = join(REPO_ROOT, 'proposals');
  const files = readdirSync(proposalsDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const proposals: SponsorProposalBlueprint[] = files.map((file) =>
    JSON.parse(readFileSync(join(proposalsDir, file), 'utf8')) as SponsorProposalBlueprint
  );

  const portfolio = auditPortfolio(proposals);
  if (!portfolio.ok) {
    record('sponsor_portfolio', 'FAIL', portfolio.errors.join('; '));
  } else {
    record(
      'sponsor_portfolio',
      'PASS',
      `${portfolio.proposalCount} proposals compliant (total escrow $${portfolio.totalEscrowUsdc} USDC, max/day ${portfolio.maxDailyCount})`
    );
  }

  const campaign = buildOrganicPromotionPlan(proposals);
  const promoAudit = auditPromotionCampaign(campaign);
  if (!promoAudit.ok) {
    record('promotion_compliance', 'FAIL', promoAudit.errors.join('; '));
  } else {
    record(
      'promotion_compliance',
      'PASS',
      `${promoAudit.actionCount} organic promotion actions verified free of prohibited incentives`
    );
  }
}

checkLicense();
checkMainPurityAndDeterminism();
checkBountyJson();
checkOwnerClaimFile();
checkProposalsAndPromotion();

let failures = 0;
for (const r of reports) {
  process.stdout.write(`${r.status.padEnd(5)} ${r.name.padEnd(22)} ${r.detail}\n`);
  if (r.status === 'FAIL') {
    failures += 1;
  }
}

if (failures > 0) {
  process.exit(1);
}
