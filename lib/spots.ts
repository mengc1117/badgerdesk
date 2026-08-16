import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Spot } from './types';

/**
 * Static layer (§5.2): all 39 spots ship as public/spots.json, generated at
 * build time by scripts/seed.mjs. Both storage backends read the same file —
 * spots are not stored in the database.
 */
let cache: Spot[] | null = null;

export function getSpots(): Spot[] {
  if (!cache) {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/spots.json'), 'utf8'));
    cache = raw.spots as Spot[];
  }
  return cache;
}
