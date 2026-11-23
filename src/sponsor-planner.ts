// Pure sponsor proposal validation, fee-split economics, and portfolio planner
// for bounty-entrants-02.

import {
  BOUNTY_ENTRANTS_02_WINDOW,
  LIVE_SPONSOR_LIMITS,
} from './sponsor-terms.ts';
import type { CompetitionWindow, SponsorLimits } from './sponsor-terms.ts';

export type ListingTrack =
  | 'auto_list'
  | 'self_text'
  | 'self_image'
  | 'reviewed_template'
  | 'custom_brief';

export interface SponsorProposalBlueprint {
  id: string;
  idea_id: string;
  planned_slug: string;
  title: string;
  category: string;
  summary: string;
  target_audience: string;
  why_worth_fee: string;
  listing_track: ListingTrack;
  template: string | null;
  final_dataset: string | null;
  prize_usd: number;
  entry_fee_usd: number;
  creator_percent: number;
  duration_hours: number;
  final_hours: number;
  planned_deposit_at: string;
  payout_split_usd: number[];
}

export interface FeeSplitEconomics {
  entry_fee_usd: number;
  house_percent: number;
  creator_percent: number;
  pot_percent: number;
  house_usd: number;
  creator_usd: number;
  pot_addition_usd: number;
  max_allowed_fee_usd: number;
  projected_pot_at_10_entrants: number;
  projected_creator_at_10_entrants: number;
}

export interface ProposalAuditResult {
  proposalId: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  leadMinutes: number;
  estimatedOpenIso: string;
  effectiveGatherHours: number;
  totalRunHours: number;
  economics: FeeSplitEconomics;
}

export interface PortfolioAuditResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  totalEscrowUsdc: number;
  proposalCount: number;
  maxDailyCount: number;
  audits: ProposalAuditResult[];
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function leadMinutesForTrack(
  track: ListingTrack,
  limits: SponsorLimits = LIVE_SPONSOR_LIMITS
): number {
  switch (track) {
    case 'auto_list':
      return limits.auto_list_lead_minutes;
    case 'self_text':
      return limits.self_setup_lead_minutes.text;
    case 'self_image':
      return limits.self_setup_lead_minutes.image;
    case 'reviewed_template':
      return Math.ceil(limits.review_hours * 60);
    case 'custom_brief':
      return 72 * 60;
  }
}

export function computeFeeSplit(
  prizeUsd: number,
  entryFeeUsd: number,
  creatorPercent: number,
  limits: SponsorLimits = LIVE_SPONSOR_LIMITS
): FeeSplitEconomics {
  const housePercent = limits.fee_house_percent;
  const potPercent = Math.max(0, 100 - housePercent - creatorPercent);
  const houseUsd = roundCents((entryFeeUsd * housePercent) / 100);
  const creatorUsd = roundCents((entryFeeUsd * creatorPercent) / 100);
  const potAdditionUsd = roundCents(entryFeeUsd - houseUsd - creatorUsd);
  const maxAllowedFeeUsd = roundCents(prizeUsd / limits.min_pot_fee_multiple);

  return {
    entry_fee_usd: entryFeeUsd,
    house_percent: housePercent,
    creator_percent: creatorPercent,
    pot_percent: potPercent,
    house_usd: houseUsd,
    creator_usd: creatorUsd,
    pot_addition_usd: potAdditionUsd,
    max_allowed_fee_usd: maxAllowedFeeUsd,
    projected_pot_at_10_entrants: roundCents(prizeUsd + potAdditionUsd * 10),
    projected_creator_at_10_entrants: roundCents(creatorUsd * 10),
  };
}

export function auditProposal(
  proposal: SponsorProposalBlueprint,
  limits: SponsorLimits = LIVE_SPONSOR_LIMITS,
  window: CompetitionWindow = BOUNTY_ENTRANTS_02_WINDOW
): ProposalAuditResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (proposal.planned_slug === window.slug) {
    errors.push(`Proposal slug cannot equal ${window.slug}`);
  }

  if (proposal.prize_usd < limits.min_prize_usd) {
    errors.push(
      `Prize pool $${proposal.prize_usd} is below sponsor minimum $${limits.min_prize_usd}`
    );
  }
  if (limits.max_prize_usd !== null && proposal.prize_usd > limits.max_prize_usd) {
    errors.push(
      `Prize pool $${proposal.prize_usd} exceeds sponsor maximum $${limits.max_prize_usd}`
    );
  }

  const payoutSum = roundCents(
    proposal.payout_split_usd.reduce((acc, amount) => acc + amount, 0)
  );
  if (Math.abs(payoutSum - proposal.prize_usd) > 0.001) {
    errors.push(
      `payout_split_usd sums to $${payoutSum}, expected prize_usd $${proposal.prize_usd}`
    );
  }

  const maxAllowedFee = roundCents(
    proposal.prize_usd / limits.min_pot_fee_multiple
  );
  if (proposal.entry_fee_usd < window.min_entry_fee_usd) {
    errors.push(
      `Entry fee $${proposal.entry_fee_usd} is below bounty-entrants-02 minimum $${window.min_entry_fee_usd}`
    );
  }
  if (proposal.entry_fee_usd > maxAllowedFee) {
    errors.push(
      `Entry fee $${proposal.entry_fee_usd} exceeds prize/${limits.min_pot_fee_multiple} cap ($${maxAllowedFee})`
    );
  }

  if (
    proposal.creator_percent !== 0 &&
    (proposal.creator_percent < limits.min_creator_percent ||
      proposal.creator_percent > limits.max_creator_percent)
  ) {
    errors.push(
      `creator_percent (${proposal.creator_percent}%) must be 0 or between ${limits.min_creator_percent}% and ${limits.max_creator_percent}%`
    );
  }

  if (proposal.duration_hours < limits.min_entries_hours) {
    errors.push(
      `duration_hours (${proposal.duration_hours}h) is below minimum ${limits.min_entries_hours}h`
    );
  }

  const totalRunHours = proposal.duration_hours + proposal.final_hours;
  if (totalRunHours > limits.max_run_hours) {
    errors.push(
      `Total run (${totalRunHours}h) exceeds sponsor max_run_hours (${limits.max_run_hours}h)`
    );
  }

  if (proposal.template !== null) {
    const templateSpec = limits.ready_templates.find(
      (item) => item.template === proposal.template && item.offered
    );
    if (!templateSpec) {
      errors.push(`Template "${proposal.template}" is not offered in sponsor terms`);
    } else if (proposal.final_dataset !== null) {
      const finalSpec = templateSpec.finals.find(
        (f) => f.dataset === proposal.final_dataset
      );
      if (!finalSpec) {
        errors.push(
          `Final dataset "${proposal.final_dataset}" is not valid for template "${proposal.template}"`
        );
      } else {
        if (finalSpec.final_hours !== proposal.final_hours) {
          errors.push(
            `final_hours (${proposal.final_hours}h) does not match dataset "${finalSpec.dataset}" (${finalSpec.final_hours}h)`
          );
        }
        if (
          finalSpec.max_duration_hours !== null &&
          proposal.duration_hours > finalSpec.max_duration_hours
        ) {
          errors.push(
            `duration_hours (${proposal.duration_hours}h) exceeds max_duration_hours (${finalSpec.max_duration_hours}h) for ${finalSpec.dataset}`
          );
        }
      }
    }
  }

  if (proposal.listing_track === 'custom_brief') {
    errors.push(
      'custom_brief track requires ~72h setup and cannot open inside the 24h bounty-entrants-02 window'
    );
  }

  const depositMs = Date.parse(proposal.planned_deposit_at);
  const windowOpenMs = Date.parse(window.opens_at);
  const windowDeadlineMs = Date.parse(window.deadline);
  const leadMinutes = leadMinutesForTrack(proposal.listing_track, limits);

  let estimatedOpenMs = depositMs + leadMinutes * 60_000;
  if (!Number.isFinite(depositMs)) {
    errors.push(`Invalid planned_deposit_at timestamp "${proposal.planned_deposit_at}"`);
    estimatedOpenMs = windowOpenMs;
  } else {
    if (estimatedOpenMs < windowOpenMs) {
      errors.push(
        `Estimated open (${new Date(estimatedOpenMs).toISOString()}) is before competition opening (${window.opens_at})`
      );
    }
    if (estimatedOpenMs > windowDeadlineMs) {
      errors.push(
        `Estimated open (${new Date(estimatedOpenMs).toISOString()}) is after competition deadline (${window.deadline})`
      );
    }
  }

  const effectiveGatherHours = Math.max(
    0,
    roundCents((windowDeadlineMs - estimatedOpenMs) / 3_600_000)
  );
  if (effectiveGatherHours < 6) {
    warnings.push(
      `Only ${effectiveGatherHours}h remain to gather paying entrants before deadline`
    );
  }

  const economics = computeFeeSplit(
    proposal.prize_usd,
    proposal.entry_fee_usd,
    proposal.creator_percent,
    limits
  );

  return {
    proposalId: proposal.id,
    ok: errors.length === 0,
    errors,
    warnings,
    leadMinutes,
    estimatedOpenIso: new Date(estimatedOpenMs).toISOString(),
    effectiveGatherHours,
    totalRunHours,
    economics,
  };
}

export function auditPortfolio(
  proposals: SponsorProposalBlueprint[],
  limits: SponsorLimits = LIVE_SPONSOR_LIMITS,
  window: CompetitionWindow = BOUNTY_ENTRANTS_02_WINDOW
): PortfolioAuditResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (proposals.length === 0) {
    errors.push('Portfolio must contain at least one bounty proposal');
  }
  if (proposals.length > limits.max_open) {
    errors.push(
      `Portfolio launches ${proposals.length} concurrent bounties, exceeding limits.max_open (${limits.max_open})`
    );
  }

  const perUtcDay = new Map<string, number>();
  const seenSlugs = new Set<string>();
  let totalEscrowUsdc = 0;

  const audits = proposals.map((proposal) => {
    totalEscrowUsdc = roundCents(totalEscrowUsdc + proposal.prize_usd);

    if (seenSlugs.has(proposal.planned_slug)) {
      errors.push(`Duplicate planned_slug "${proposal.planned_slug}" in portfolio`);
    }
    seenSlugs.add(proposal.planned_slug);

    const parsedDate = Date.parse(proposal.planned_deposit_at);
    if (Number.isFinite(parsedDate)) {
      const utcDay = new Date(parsedDate).toISOString().slice(0, 10);
      perUtcDay.set(utcDay, (perUtcDay.get(utcDay) ?? 0) + 1);
    }

    return auditProposal(proposal, limits, window);
  });

  let maxDailyCount = 0;
  for (const [day, count] of perUtcDay.entries()) {
    if (count > maxDailyCount) {
      maxDailyCount = count;
    }
    if (count > limits.max_per_day) {
      errors.push(
        `UTC day ${day} schedules ${count} proposals, exceeding limits.max_per_day (${limits.max_per_day})`
      );
    }
  }

  for (const audit of audits) {
    for (const err of audit.errors) {
      errors.push(`[${audit.proposalId}] ${err}`);
    }
    for (const warn of audit.warnings) {
      warnings.push(`[${audit.proposalId}] ${warn}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    totalEscrowUsdc,
    proposalCount: proposals.length,
    maxDailyCount,
    audits,
  };
}
