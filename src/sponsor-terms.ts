// Live make.fun sponsor terms snapshot (fetched from GET /api/sponsor/terms on 2026-11-23)
// combined with bounty-entrants-02 competition window and entry-link constraints.

export interface ReadyTemplateFinal {
  dataset: string;
  final_hours: number;
  max_duration_hours: number | null;
}

export interface ReadyTemplateSpec {
  template: string;
  label: string;
  offered: boolean;
  finals: ReadyTemplateFinal[];
}

export interface SponsorLimits {
  min_prize_usd: number;
  max_prize_usd: number | null;
  fee_house_percent: number;
  fee_model: 'total';
  min_creator_percent: number;
  max_creator_percent: number;
  review_hours: number;
  min_entries_hours: number;
  max_start_hours: number;
  auto_list_lead_minutes: number;
  self_setup_lead_minutes: {
    text: number;
    image: number;
  };
  max_run_hours: number;
  min_pot_fee_multiple: number;
  min_entry_fee_usd: number;
  max_open: number;
  max_per_day: number;
  mint: string;
  cluster: 'mainnet' | 'devnet';
  ready_templates: ReadyTemplateSpec[];
}

export interface CompetitionWindow {
  slug: string;
  opens_at: string;
  deadline: string;
  min_entry_fee_usd: number;
  min_entrants_to_count: number;
  reward_usd: number;
  paid_places: number;
}

export const SPONSOR_TERMS_VERSION = '2026-11-21.draft-6';

export const LIVE_SPONSOR_LIMITS: SponsorLimits = {
  min_prize_usd: 5,
  max_prize_usd: null,
  fee_house_percent: 15,
  fee_model: 'total',
  min_creator_percent: 15,
  max_creator_percent: 50,
  review_hours: 1 / 12,
  min_entries_hours: 0.25,
  max_start_hours: 24,
  auto_list_lead_minutes: 5,
  self_setup_lead_minutes: {
    text: 35,
    image: 65,
  },
  max_run_hours: 168,
  min_pot_fee_multiple: 5,
  min_entry_fee_usd: 0.1,
  max_open: 3,
  max_per_day: 3,
  mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  cluster: 'mainnet',
  ready_templates: [
    {
      template: 'pumpfun-replay',
      label: 'Solana trading bot on a replay',
      offered: true,
      finals: [
        { dataset: 'pumpfun-forward-6h', final_hours: 6, max_duration_hours: 162 },
        { dataset: 'pumpfun-forward-24h', final_hours: 24, max_duration_hours: 144 },
        { dataset: 'pumpfun-forward-72h', final_hours: 72, max_duration_hours: 96 },
      ],
    },
    {
      template: 'solana-bars-1h',
      label: 'Hourly Solana trading bot',
      offered: true,
      finals: [
        { dataset: 'bars-forward-72h', final_hours: 72, max_duration_hours: 72 },
        { dataset: 'bars-forward-7d', final_hours: 168, max_duration_hours: null },
      ],
    },
    {
      template: 'solana-clmm-lp',
      label: 'Concentrated-liquidity LP manager',
      offered: true,
      finals: [
        { dataset: 'clmm-forward-72h', final_hours: 72, max_duration_hours: 72 },
        { dataset: 'clmm-forward-7d', final_hours: 168, max_duration_hours: null },
      ],
    },
  ],
};

export const BOUNTY_ENTRANTS_02_WINDOW: CompetitionWindow = {
  slug: 'bounty-entrants-02',
  opens_at: '2026-11-23T07:30:00Z',
  deadline: '2026-11-24T07:30:00Z',
  min_entry_fee_usd: 0.5,
  min_entrants_to_count: 1,
  reward_usd: 250,
  paid_places: 50,
};
