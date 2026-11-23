// Entrypoint for make.fun competition bounty-entrants-02 (Node 22+, stdlib only).
// Deterministically reads BOUNTY.json from MAKEFUN_BOT_DIR (default /bot) and
// writes the exact bytes to MAKEFUN_OUTPUT_DIR/BOUNTY.json (default /output).
// Constraints: no network calls, no wall-clock reads, no filesystem access outside
// MAKEFUN_BOT_DIR and MAKEFUN_OUTPUT_DIR, silent stdout on success.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const SOURCE_PATH = join(BOT_DIR, 'BOUNTY.json');
const TARGET_PATH = join(OUTPUT_DIR, 'BOUNTY.json');

function main(): void {
  let raw: Buffer;
  try {
    raw = readFileSync(SOURCE_PATH);
  } catch (err) {
    process.stderr.write(
      `Failed to read BOUNTY.json from ${SOURCE_PATH}: ${(err as Error).message}\n`
    );
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(TARGET_PATH, raw);
}

main();
