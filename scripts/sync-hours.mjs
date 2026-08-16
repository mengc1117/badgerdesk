/**
 * Opening-hours sync task (intended for a weekly cron).
 *
 *   node scripts/sync-hours.mjs           # dry run, report diffs only
 *   node scripts/sync-hours.mjs --write   # write data/hours.json and regenerate spots.json
 *
 * Spots with hours_source=libcal come from the LibCal API (client not yet
 * implemented, see TODO); manual spots are maintained by hand.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');

const doc = JSON.parse(readFileSync(resolve(root, 'data/hours.json'), 'utf8'));
const spots = JSON.parse(readFileSync(resolve(root, 'public/spots.json'), 'utf8')).spots;

const libcalSpots = spots.filter((s) => s.hoursSource === 'libcal');

/**
 * TODO: implement the LibCal client. Needs LIBCAL_CLIENT_ID / LIBCAL_CLIENT_SECRET
 * and the LibCal location id for each spot.
 * Contract: return { [spotId]: { week } | null }; null = keep the existing value.
 */
async function fetchFromLibCal(ids) {
  if (!process.env.LIBCAL_CLIENT_ID) {
    console.log('  ⚠ LIBCAL_CLIENT_ID not configured — skipping library sync (keeping existing hours)');
    return Object.fromEntries(ids.map((id) => [id, null]));
  }
  throw new Error('LibCal client not implemented yet');
}

const fresh = await fetchFromLibCal(libcalSpots.map((s) => s.id));

let changed = 0;
for (const [id, next] of Object.entries(fresh)) {
  if (!next) continue;
  const before = JSON.stringify(doc.hours[id]?.week ?? null);
  const after = JSON.stringify(next.week);
  if (before === after) continue;
  changed++;
  console.log(`  ~ ${id}\n    old ${before}\n    new ${after}`);
  doc.hours[id] = { ...(doc.hours[id] ?? {}), week: next.week };
}

// Explicit null (known-unknown) vs missing entry are reported separately
const missing = spots.filter((s) => !Object.prototype.hasOwnProperty.call(doc.hours, s.id));
const unknown = spots.filter((s) => doc.hours[s.id] === null);

console.log(`\nHours sync: ${libcalSpots.length} LibCal spots, ${changed} changed`);
console.log(`  hours unknown (UI shows 'Hours unknown', never 'closed'): ${unknown.length}`);
if (missing.length) console.log(`  ✗ missing entries in hours.json: ${missing.map((s) => s.id).join(', ')}`);

if (WRITE && changed) {
  doc._syncedAt = new Date().toISOString();
  writeFileSync(resolve(root, 'data/hours.json'), JSON.stringify(doc, null, 2) + '\n');
  execFileSync(process.execPath, [resolve(root, 'scripts/seed.mjs')], { stdio: 'inherit' });
  console.log('✓ wrote data/hours.json and regenerated public/spots.json');
} else if (changed) {
  console.log('(dry run; pass --write to persist)');
}
