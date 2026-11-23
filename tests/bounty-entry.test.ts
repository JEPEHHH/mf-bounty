import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  BOUNTY_FILE_MAX_BYTES,
  compareRankedEntries,
  parseBountyRef,
  scoreBountyCounts,
  validateBountyFileBuffer,
} from '../src/bounty-validator.ts';
import {
  auditPromotionCampaign,
  buildOrganicPromotionPlan,
} from '../src/promotion-playbook.ts';
import {
  auditPortfolio,
  auditProposal,
  computeFeeSplit,
} from '../src/sponsor-planner.ts';
import type { SponsorProposalBlueprint } from '../src/sponsor-planner.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..');

function loadRepoProposals(): SponsorProposalBlueprint[] {
  const dir = join(REPO_ROOT, 'proposals');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map(
      (file) =>
        JSON.parse(readFileSync(join(dir, file), 'utf8')) as SponsorProposalBlueprint
    );
}

describe('bounty-validator: parseBountyRef & validateBountyFileBuffer', () => {
  it('parses /bounty, /c, subdomain URLs, bare slugs, and lowercase UUIDs', () => {
    const a = parseBountyRef('https://make.fun/bounty/frog-jazz-01/?ref=x#top');
    assert.equal(a?.kind, 'url_bounty');
    assert.equal(a?.slug, 'frog-jazz-01');

    const b = parseBountyRef('http://app.make.fun/c/smart-fridge-01/');
    assert.equal(b?.kind, 'url_c');
    assert.equal(b?.slug, 'smart-fridge-01');

    const c = parseBountyRef('memecoin-sprint-01');
    assert.equal(c?.kind, 'slug');
    assert.equal(c?.canonicalKey, 'slug:memecoin-sprint-01');

    const d = parseBountyRef('550e8400-e29b-41d4-a716-446655440000');
    assert.equal(d?.kind, 'uuid');
    assert.equal(d?.id, '550e8400-e29b-41d4-a716-446655440000');

    assert.equal(parseBountyRef('https://evil-make.fun/bounty/foo'), null);
    assert.equal(parseBountyRef('https://make.fun/bounty/<slug>'), null);
    assert.equal(parseBountyRef('https://make.fun/profile/user'), null);
  });

  it('deduplicates equivalent references and supports single-bounty url format', () => {
    const raw = Buffer.from(
      JSON.stringify({
        bounties: [
          'https://make.fun/bounty/alpha-01',
          'https://make.fun/c/alpha-01/',
          'alpha-01',
          'beta-02',
        ],
      })
    );
    const res = validateBountyFileBuffer(raw);
    assert.equal(res.ok, true);
    assert.equal(res.items.length, 2);
    assert.equal(res.warnings.length, 2);

    const single = validateBountyFileBuffer(
      Buffer.from(JSON.stringify({ url: 'https://make.fun/bounty/gamma-03' }))
    );
    assert.equal(single.ok, true);
    assert.equal(single.items.length, 1);
  });

  it('rejects self-bounty, dual keys, empty lists, oversized files, and >100 items', () => {
    assert.equal(
      validateBountyFileBuffer(
        Buffer.from(JSON.stringify({ bounties: ['https://make.fun/bounty/bounty-entrants-02'] }))
      ).ok,
      false
    );

    assert.equal(
      validateBountyFileBuffer(
        Buffer.from(
          JSON.stringify({
            bounties: ['alpha-01'],
            url: 'https://make.fun/bounty/alpha-01',
          })
        )
      ).ok,
      false
    );

    assert.equal(
      validateBountyFileBuffer(Buffer.from(JSON.stringify({ bounties: [] }))).ok,
      false
    );

    const tooMany = Array.from({ length: 101 }, (_, i) => `bounty-${i}`);
    assert.equal(
      validateBountyFileBuffer(Buffer.from(JSON.stringify({ bounties: tooMany }))).ok,
      false
    );

    const oversized = Buffer.alloc(BOUNTY_FILE_MAX_BYTES + 1, ' ');
    assert.equal(validateBountyFileBuffer(oversized).ok, false);
  });
});

describe('bounty-validator: scoreBountyCounts & tie-breaking', () => {
  it('computes totals accurately on deadline and check readings', () => {
    const bountyFile = Buffer.from(
      JSON.stringify({
        bounties: [
          'https://make.fun/bounty/b-1',
          'https://make.fun/bounty/b-2',
          'https://make.fun/bounty/b-3',
        ],
      })
    );

    const countsDeadline = Buffer.from(
      JSON.stringify({
        format: 'makefun/bounty-counts/v2',
        reading: 'deadline',
        min_entrants: 1,
        bounties: [
          { slug: 'b-1', bounty: 'live', entrants: 4, pot_cents: 636, entry_fees_cents: 200 },
          { slug: 'b-2', bounty: 'live', entrants: 0, pot_cents: 500, entry_fees_cents: 0 },
          { slug: 'b-3', bounty: 'gone', entrants: 9, pot_cents: 900, entry_fees_cents: 450 },
        ],
      })
    );

    const score = scoreBountyCounts(bountyFile, countsDeadline);
    assert.equal(score.valid, 1);
    assert.equal(score.entrants, 4);
    assert.equal(score.bounties, 1);
    assert.equal(score.pot_usd, 6.36);
    assert.equal(score.entry_fees_usd, 2);

    // Zero counting bounties on deadline must read invalid
    const zeroDeadline = Buffer.from(
      JSON.stringify({
        format: 'makefun/bounty-counts/v2',
        reading: 'deadline',
        min_entrants: 1,
        bounties: [
          { slug: 'b-1', bounty: 'live', entrants: 0, pot_cents: 500, entry_fees_cents: 0 },
          { slug: 'b-2', bounty: 'live', entrants: 0, pot_cents: 500, entry_fees_cents: 0 },
          { slug: 'b-3', bounty: 'live', entrants: 0, pot_cents: 500, entry_fees_cents: 0 },
        ],
      })
    );
    assert.equal(scoreBountyCounts(bountyFile, zeroDeadline).valid, 0);

    // Same 0-entrant reading during 'check' (dev board) stays valid while live
    const zeroCheck = Buffer.from(
      JSON.stringify({
        format: 'makefun/bounty-counts/v2',
        reading: 'check',
        min_entrants: 1,
        bounties: [
          { slug: 'b-1', bounty: 'live', entrants: 0, pot_cents: 500, entry_fees_cents: 0 },
          { slug: 'b-2', bounty: 'live', entrants: 0, pot_cents: 500, entry_fees_cents: 0 },
          { slug: 'b-3', bounty: 'live', entrants: 0, pot_cents: 500, entry_fees_cents: 0 },
        ],
      })
    );
    assert.equal(scoreBountyCounts(bountyFile, zeroCheck).valid, 1);
  });

  it('ranks by valid desc, entrants desc, pot_usd desc, then receiptMs asc', () => {
    const entries = [
      { entryId: 'late-tie', valid: 1 as const, entrants: 10, pot_usd: 25, receiptMs: 2000 },
      { entryId: 'early-tie', valid: 1 as const, entrants: 10, pot_usd: 25, receiptMs: 1000 },
      { entryId: 'bigger-pot', valid: 1 as const, entrants: 10, pot_usd: 30, receiptMs: 3000 },
      { entryId: 'invalid', valid: 0 as const, entrants: 99, pot_usd: 999, receiptMs: 1 },
      { entryId: 'most-entrants', valid: 1 as const, entrants: 12, pot_usd: 15, receiptMs: 5000 },
    ];
    entries.sort(compareRankedEntries);
    assert.deepEqual(
      entries.map((e) => e.entryId),
      ['most-entrants', 'bigger-pot', 'early-tie', 'late-tie', 'invalid']
    );
  });
});

describe('sponsor-planner: terms limits & portfolio economics', () => {
  it('audits repository proposals cleanly against live sponsor terms', () => {
    const proposals = loadRepoProposals();
    const portfolio = auditPortfolio(proposals);
    assert.equal(portfolio.ok, true, portfolio.errors.join('; '));
    assert.equal(portfolio.proposalCount, 3);
    assert.equal(portfolio.totalEscrowUsdc, 15);
    assert.equal(portfolio.maxDailyCount, 3);
  });

  it('rejects fee < $0.50, fee > prize/5, custom_brief, and >3 concurrent bounties', () => {
    const [base] = loadRepoProposals();

    const lowFee = auditProposal({ ...base, entry_fee_usd: 0.49 });
    assert.equal(lowFee.ok, false);

    const highFee = auditProposal({ ...base, prize_usd: 5, entry_fee_usd: 1.5 });
    assert.equal(highFee.ok, false);

    const customBrief = auditProposal({ ...base, listing_track: 'custom_brief' });
    assert.equal(customBrief.ok, false);

    const split = computeFeeSplit(5, 0.5, 15);
    assert.equal(split.pot_percent, 70);
    assert.equal(split.max_allowed_fee_usd, 1);

    const proposals = loadRepoProposals();
    const tooMany = auditPortfolio([
      ...proposals,
      { ...base, id: 'bounty-4', planned_slug: 'extra-bounty-04' },
    ]);
    assert.equal(tooMany.ok, false);
  });
});

describe('promotion-playbook: anti-bought-entrants compliance', () => {
  it('approves organic campaign and flags refunds or per-entry payouts', () => {
    const proposals = loadRepoProposals();
    const plan = buildOrganicPromotionPlan(proposals);
    assert.equal(auditPromotionCampaign(plan).ok, true);

    const badPricing = auditPromotionCampaign([
      { ...plan[0], pricingModel: 'per_entry' },
    ]);
    assert.equal(badPricing.ok, false);

    const badCopy = auditPromotionCampaign([
      {
        ...plan[0],
        copy: `Enter ${plan[0].bountySlug} at https://make.fun/bounty/${plan[0].bountySlug} and I will refund your entry fee!`,
      },
    ]);
    assert.equal(badCopy.ok, false);
  });
});

describe('main.ts: deterministic grader execution', () => {
  it('copies BOUNTY.json byte-for-byte with silent stdout and rejects bad files', () => {
    const mainPath = join(REPO_ROOT, 'main.ts');
    const tmpBase = mkdtempSync(join(tmpdir(), 'bounty-entrants-02-test-'));

    try {
      const outA = join(tmpBase, 'out-a');
      const outB = join(tmpBase, 'out-b');
      const stdA = execFileSync(process.execPath, [mainPath], {
        env: { ...process.env, MAKEFUN_BOT_DIR: REPO_ROOT, MAKEFUN_OUTPUT_DIR: outA },
        encoding: 'utf8',
      });
      const stdB = execFileSync(process.execPath, [mainPath], {
        env: { ...process.env, MAKEFUN_BOT_DIR: REPO_ROOT, MAKEFUN_OUTPUT_DIR: outB },
        encoding: 'utf8',
      });

      assert.equal(stdA, '');
      assert.equal(stdB, '');

      const expected = readFileSync(join(REPO_ROOT, 'BOUNTY.json'));
      assert.equal(expected.equals(readFileSync(join(outA, 'BOUNTY.json'))), true);
      assert.equal(expected.equals(readFileSync(join(outB, 'BOUNTY.json'))), true);

      // Invalid BOUNTY.json must fail fast
      const badBotDir = join(tmpBase, 'bad-bot');
      const badOutDir = join(tmpBase, 'bad-out');
      rmSync(badBotDir, { recursive: true, force: true });
      execFileSync('mkdir', ['-p', badBotDir]);
      writeFileSync(
        join(badBotDir, 'BOUNTY.json'),
        JSON.stringify({ bounties: ['https://make.fun/bounty/bounty-entrants-02'] })
      );

      assert.throws(() => {
        execFileSync(process.execPath, [mainPath], {
          env: { ...process.env, MAKEFUN_BOT_DIR: badBotDir, MAKEFUN_OUTPUT_DIR: badOutDir },
          stdio: 'pipe',
        });
      });
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  });
});
