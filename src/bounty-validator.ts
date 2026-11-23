// Pure deterministic validator and scorer mirror for make.fun bounty-entrants-02.
// Implements the makefun/bounty-gate/v2 and makefun/bounty-counts/v2 rules from
// competition.yaml using only standard language features (no network, no wall clock).

export const BOUNTY_FILE_MAX_BYTES = 16384;
export const BOUNTY_ITEM_MAX_CHARS = 2048;
export const BOUNTY_LIST_MAX_ITEMS = 100;
export const BOUNTY_COUNTS_MAX_BYTES = 65536;
export const SELF_COMPETITION_SLUG = 'bounty-entrants-02';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type BountyRefKind = 'url_bounty' | 'url_c' | 'slug' | 'uuid';

export interface ParsedBountyRef {
  raw: string;
  kind: BountyRefKind;
  canonicalKey: string;
  slug: string | null;
  id: string | null;
}

export interface BountyValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  bytes: number;
  items: ParsedBountyRef[];
  uniqueKeys: string[];
}

export interface ValidateOptions {
  strictLive?: boolean;
}

export interface BountyCountRow {
  slug: string;
  id?: string;
  bounty: 'live' | 'gone';
  entrants: number;
  pot_cents: number;
  entry_fees_cents: number;
}

export interface BountyCountsFile {
  format: 'makefun/bounty-counts/v2';
  reading: 'check' | 'latest' | 'deadline';
  min_entrants: number;
  bounties: BountyCountRow[];
}

export interface ScoreTotals {
  valid: 0 | 1;
  entrants: number;
  pot_usd: number;
  bounties: number;
  entry_fees_usd: number;
  errors: string[];
}

function isMakefunHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === 'make.fun' || lower.endsWith('.make.fun');
}

export function parseBountyRef(rawInput: string): ParsedBountyRef | null {
  if (typeof rawInput !== 'string') {
    return null;
  }
  const trimmed = rawInput.trim();
  if (trimmed.length === 0 || trimmed.length > BOUNTY_ITEM_MAX_CHARS) {
    return null;
  }

  if (UUID_RE.test(trimmed)) {
    return {
      raw: rawInput,
      kind: 'uuid',
      canonicalKey: `id:${trimmed}`,
      slug: null,
      id: trimmed,
    };
  }

  if (SLUG_RE.test(trimmed)) {
    return {
      raw: rawInput,
      kind: 'slug',
      canonicalKey: `slug:${trimmed}`,
      slug: trimmed,
      id: null,
    };
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      return null;
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }
    if (!isMakefunHost(parsedUrl.hostname)) {
      return null;
    }

    const segments = parsedUrl.pathname
      .replace(/\/+$/, '')
      .split('/')
      .filter((segment) => segment.length > 0);

    if (segments.length !== 2) {
      return null;
    }

    const [prefix, target] = segments;
    if (prefix !== 'bounty' && prefix !== 'c') {
      return null;
    }

    const normalizedTarget = target.toLowerCase();
    if (!SLUG_RE.test(normalizedTarget)) {
      return null;
    }

    return {
      raw: rawInput,
      kind: prefix === 'bounty' ? 'url_bounty' : 'url_c',
      canonicalKey: `slug:${normalizedTarget}`,
      slug: normalizedTarget,
      id: null,
    };
  }

  return null;
}

export function validateBountyFileBuffer(
  raw: Buffer,
  options: ValidateOptions = {}
): BountyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bytes = raw.byteLength;

  if (bytes === 0) {
    return {
      ok: false,
      errors: ['BOUNTY.json is empty'],
      warnings,
      bytes,
      items: [],
      uniqueKeys: [],
    };
  }

  if (bytes > BOUNTY_FILE_MAX_BYTES) {
    errors.push(
      `BOUNTY.json exceeds ${BOUNTY_FILE_MAX_BYTES} bytes (got ${bytes} bytes)`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    return {
      ok: false,
      errors: [`BOUNTY.json is not valid JSON: ${(err as Error).message}`],
      warnings,
      bytes,
      items: [],
      uniqueKeys: [],
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      errors: ['BOUNTY.json root must be a JSON object'],
      warnings,
      bytes,
      items: [],
      uniqueKeys: [],
    };
  }

  const record = parsed as Record<string, unknown>;
  const hasBounties = Object.prototype.hasOwnProperty.call(record, 'bounties');
  const hasUrl = Object.prototype.hasOwnProperty.call(record, 'url');

  if (hasBounties && hasUrl) {
    errors.push('BOUNTY.json cannot define both "bounties" and "url"');
  } else if (!hasBounties && !hasUrl) {
    errors.push('BOUNTY.json must define either "bounties" or "url"');
  }

  let rawEntries: unknown[] = [];
  if (hasBounties && !hasUrl) {
    if (!Array.isArray(record.bounties)) {
      errors.push('"bounties" must be an array of strings');
    } else {
      rawEntries = record.bounties;
    }
  } else if (hasUrl && !hasBounties) {
    if (typeof record.url !== 'string') {
      errors.push('"url" must be a string');
    } else {
      rawEntries = [record.url];
    }
  }

  if (errors.length === 0) {
    if (rawEntries.length === 0) {
      errors.push('BOUNTY.json must name at least 1 bounty');
    }
    if (rawEntries.length > BOUNTY_LIST_MAX_ITEMS) {
      errors.push(
        `BOUNTY.json may name at most ${BOUNTY_LIST_MAX_ITEMS} bounties (got ${rawEntries.length})`
      );
    }
  }

  const items: ParsedBountyRef[] = [];
  const seen = new Set<string>();
  const uniqueKeys: string[] = [];

  for (let idx = 0; idx < rawEntries.length; idx += 1) {
    const entry = rawEntries[idx];
    if (typeof entry !== 'string') {
      errors.push(`Item ${idx + 1} is not a string`);
      continue;
    }
    if (entry.length > BOUNTY_ITEM_MAX_CHARS) {
      errors.push(
        `Item ${idx + 1} exceeds ${BOUNTY_ITEM_MAX_CHARS} characters`
      );
      continue;
    }

    const parsedRef = parseBountyRef(entry);
    if (!parsedRef) {
      errors.push(
        `Item ${idx + 1} ("${entry}") is not a valid make.fun bounty URL, slug, or UUID`
      );
      continue;
    }

    if (parsedRef.slug === SELF_COMPETITION_SLUG) {
      errors.push(
        `Item ${idx + 1} cannot reference this competition itself (${SELF_COMPETITION_SLUG})`
      );
      continue;
    }

    if (
      options.strictLive &&
      parsedRef.slug !== null &&
      (parsedRef.slug.includes('placeholder') ||
        parsedRef.slug.includes('example'))
    ) {
      warnings.push(
        `Item ${idx + 1} ("${parsedRef.slug}") looks like a placeholder slug; replace with your approved public bounty slug before submitting`
      );
    }

    if (seen.has(parsedRef.canonicalKey)) {
      warnings.push(
        `Item ${idx + 1} ("${entry}") duplicates an earlier bounty reference and will be counted once`
      );
      continue;
    }

    seen.add(parsedRef.canonicalKey);
    uniqueKeys.push(parsedRef.canonicalKey);
    items.push(parsedRef);
  }

  return {
    ok: errors.length === 0 && items.length > 0,
    errors,
    warnings,
    bytes,
    items,
    uniqueKeys,
  };
}

export function scoreBountyCounts(
  bountyFileRaw: Buffer,
  countsFileRaw: Buffer
): ScoreTotals {
  const zero = (errors: string[]): ScoreTotals => ({
    valid: 0,
    entrants: 0,
    pot_usd: 0,
    bounties: 0,
    entry_fees_usd: 0,
    errors,
  });

  const bountyCheck = validateBountyFileBuffer(bountyFileRaw);
  if (!bountyCheck.ok) {
    return zero(bountyCheck.errors);
  }

  if (countsFileRaw.byteLength > BOUNTY_COUNTS_MAX_BYTES) {
    return zero([
      `bounty.counts.json exceeds ${BOUNTY_COUNTS_MAX_BYTES} bytes`,
    ]);
  }

  let countsObj: unknown;
  try {
    countsObj = JSON.parse(countsFileRaw.toString('utf8'));
  } catch (err) {
    return zero([
      `bounty.counts.json is not valid JSON: ${(err as Error).message}`,
    ]);
  }

  if (
    countsObj === null ||
    typeof countsObj !== 'object' ||
    Array.isArray(countsObj)
  ) {
    return zero(['bounty.counts.json root must be an object']);
  }

  const counts = countsObj as Partial<BountyCountsFile>;
  if (counts.format !== 'makefun/bounty-counts/v2') {
    return zero(['bounty.counts.json format must be makefun/bounty-counts/v2']);
  }
  if (
    counts.reading !== 'check' &&
    counts.reading !== 'latest' &&
    counts.reading !== 'deadline'
  ) {
    return zero(['bounty.counts.json reading must be check, latest, or deadline']);
  }
  if (
    typeof counts.min_entrants !== 'number' ||
    !Number.isInteger(counts.min_entrants) ||
    counts.min_entrants < 1
  ) {
    return zero(['bounty.counts.json min_entrants must be a positive integer']);
  }
  if (!Array.isArray(counts.bounties)) {
    return zero(['bounty.counts.json bounties must be an array']);
  }

  const bySlug = new Map<string, BountyCountRow>();
  const byId = new Map<string, BountyCountRow>();

  for (const row of counts.bounties) {
    if (
      typeof row.slug !== 'string' ||
      (row.bounty !== 'live' && row.bounty !== 'gone') ||
      !Number.isInteger(row.entrants) ||
      row.entrants < 0 ||
      !Number.isInteger(row.pot_cents) ||
      row.pot_cents < 0 ||
      !Number.isInteger(row.entry_fees_cents) ||
      row.entry_fees_cents < 0
    ) {
      return zero(['bounty.counts.json contains a malformed row']);
    }
    bySlug.set(row.slug, row);
    if (typeof row.id === 'string') {
      byId.set(row.id, row);
    }
  }

  const matchedRows: BountyCountRow[] = [];
  const matchedSlugs = new Set<string>();

  for (const ref of bountyCheck.items) {
    const row =
      ref.slug !== null
        ? bySlug.get(ref.slug)
        : ref.id !== null
          ? byId.get(ref.id)
          : undefined;
    if (!row) {
      return zero([
        `bounty.counts.json is missing named bounty "${ref.raw}"`,
      ]);
    }
    if (!matchedSlugs.has(row.slug)) {
      matchedSlugs.add(row.slug);
      matchedRows.push(row);
    }
  }

  if (matchedSlugs.size !== counts.bounties.length) {
    return zero([
      'bounty.counts.json names different bounties than BOUNTY.json',
    ]);
  }

  let liveCount = 0;
  let countingBounties = 0;
  let totalEntrants = 0n;
  let totalPotCents = 0n;
  let totalEntryFeesCents = 0n;

  for (const row of matchedRows) {
    if (row.bounty !== 'live') {
      continue;
    }
    liveCount += 1;
    if (row.entrants >= counts.min_entrants) {
      countingBounties += 1;
      totalEntrants += BigInt(row.entrants);
      totalPotCents += BigInt(row.pot_cents);
      totalEntryFeesCents += BigInt(row.entry_fees_cents);
    }
  }

  if (liveCount === 0) {
    return zero(['No named bounty reads live']);
  }
  if (counts.reading === 'deadline' && countingBounties === 0) {
    return zero(['No named bounty reached min_entrants by the deadline']);
  }

  return {
    valid: 1,
    entrants: Number(totalEntrants),
    pot_usd: Number(totalPotCents) / 100,
    bounties: countingBounties,
    entry_fees_usd: Number(totalEntryFeesCents) / 100,
    errors: [],
  };
}

export interface RankedEntrySnapshot {
  entryId: string;
  valid: 0 | 1;
  entrants: number;
  pot_usd: number;
  receiptMs: number;
}

export function compareRankedEntries(
  a: RankedEntrySnapshot,
  b: RankedEntrySnapshot
): number {
  if (a.valid !== b.valid) {
    return b.valid - a.valid;
  }
  if (a.entrants !== b.entrants) {
    return b.entrants - a.entrants;
  }
  if (a.pot_usd !== b.pot_usd) {
    return b.pot_usd - a.pot_usd;
  }
  return a.receiptMs - b.receiptMs;
}
