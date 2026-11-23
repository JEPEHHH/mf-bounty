// Organic acquisition playbook and anti-bought-entrants compliance guard for bounty-entrants-02.
// Competition rules prohibit paying, rewarding, or refunding entrants outside the bounty's own prizes.
// Ordinary organic promotion (posts, community messages, videos, reach-based ads) is permitted.

import type { SponsorProposalBlueprint } from './sponsor-planner.ts';

export type PromoChannel =
  | 'x_thread'
  | 'discord_community'
  | 'telegram_builders'
  | 'reddit_ai_agents'
  | 'github_readme';

export type PricingModel = 'organic' | 'reach_cpm' | 'per_entry';

export interface PromotionAction {
  id: string;
  channel: PromoChannel;
  bountySlug: string;
  pricingModel: PricingModel;
  offersRefundOrRebate: boolean;
  offersExternalGiveaway: boolean;
  copy: string;
}

export interface PromotionAuditResult {
  ok: boolean;
  errors: string[];
  actionCount: number;
}

const FORBIDDEN_COPY_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'entry fee refund', regex: /\brefund(?:s|ed|ing)?\b.{0,24}\bfee\b|\bfee\b.{0,24}\brefund\b/i },
  { label: 'cashback incentive', regex: /\bcash\s?back\b|\brebate\b/i },
  { label: 'pay-per-entry offer', regex: /\bpay(?:ing)?\s+(?:you\s+)?per\s+entry\b|\bpaid\s+to\s+enter\b/i },
  { label: 'external giveaway', regex: /\bbonus\s+giveaway\b|\bairdrop\s+for\s+entering\b/i },
];

export function buildOrganicPromotionPlan(
  proposals: SponsorProposalBlueprint[]
): PromotionAction[] {
  const actions: PromotionAction[] = [];

  for (const proposal of proposals) {
    const bountyUrl = `https://make.fun/bounty/${proposal.planned_slug}`;
    const oneLinePitch =
      'make.fun is a site where people and their AI agents build things, enter them in paid competitions (bounties) and earn real money when they win.';

    actions.push({
      id: `${proposal.id}-x`,
      channel: 'x_thread',
      bountySlug: proposal.planned_slug,
      pricingModel: 'organic',
      offersRefundOrRebate: false,
      offersExternalGiveaway: false,
      copy: `${proposal.title} is live on make.fun! ${proposal.summary} Entry fee: $${proposal.entry_fee_usd.toFixed(2)}, starting pot: $${proposal.prize_usd} USDC (70% of each fee grows the pot). Enter here: ${bountyUrl}`,
    });

    actions.push({
      id: `${proposal.id}-community`,
      channel: 'discord_community',
      bountySlug: proposal.planned_slug,
      pricingModel: 'organic',
      offersRefundOrRebate: false,
      offersExternalGiveaway: false,
      copy: `${oneLinePitch} New ${proposal.category} bounty open now: "${proposal.title}". ${proposal.why_worth_fee} Details and rules: ${bountyUrl}`,
    });
  }

  return actions;
}

export function auditPromotionCampaign(
  actions: PromotionAction[]
): PromotionAuditResult {
  const errors: string[] = [];

  if (actions.length === 0) {
    errors.push('Promotion campaign must define at least one organic action');
  }

  for (const action of actions) {
    if (action.pricingModel === 'per_entry') {
      errors.push(
        `[${action.id}] pricingModel "per_entry" is disqualified by bounty-entrants-02 rules`
      );
    }
    if (action.offersRefundOrRebate) {
      errors.push(
        `[${action.id}] offering fee refunds or rebates is disqualified by bounty-entrants-02 rules`
      );
    }
    if (action.offersExternalGiveaway) {
      errors.push(
        `[${action.id}] external giveaways outside the bounty prizes are disqualified`
      );
    }
    if (!action.copy.includes(`https://make.fun/bounty/${action.bountySlug}`)) {
      errors.push(
        `[${action.id}] promotion copy should include the direct bounty link https://make.fun/bounty/${action.bountySlug}`
      );
    }
    for (const pattern of FORBIDDEN_COPY_PATTERNS) {
      if (pattern.regex.test(action.copy)) {
        errors.push(
          `[${action.id}] promotion copy triggers forbidden "${pattern.label}" rule`
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    actionCount: actions.length,
  };
}
