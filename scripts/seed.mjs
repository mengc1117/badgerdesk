/**
 * data/spots.seed.csv + data/hours.json → public/spots.json
 *
 *   node scripts/seed.mjs
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal CSV parser with quoted-field support. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** Coordinates missing from the seed CSV, approximated from addresses and flagged in the UI. */
const COORD_PATCHES = {
  morgridge: { lat: 43.0718, lng: -89.407, why: 'Coordinates approximated from the address (new CDIS building, 1210 W Dayton St) — needs on-site verification' },
  'madison-central': { lat: 43.07438, lng: -89.38737, why: 'Coordinates approximated from the address (201 W Mifflin St) — needs on-site verification' },
};

/** Spots needing verification. */
const STATUS_NOTES = {
  'steep-brew': 'Older reviews suggest this location may have closed — operating status needs verification',
};

const csv = parseCsv(readFileSync(resolve(root, 'data/spots.seed.csv'), 'utf8'));
const hoursDoc = JSON.parse(readFileSync(resolve(root, 'data/hours.json'), 'utf8'));

const spots = csv.map((r) => {
  const patch = COORD_PATCHES[r.id];
  const lat = r.lat ? Number(r.lat) : patch?.lat;
  const lng = r.lng ? Number(r.lng) : patch?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Spot ${r.id} is missing coordinates and has no patch`);
  }

  const hours = Object.prototype.hasOwnProperty.call(hoursDoc.hours, r.id) ? hoursDoc.hours[r.id] : null;

  return {
    id: r.id,
    name: r.name,
    building: r.building,
    floorHint: r.floor_hint || null,
    category: r.category,
    address: r.address || null,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    hoursSource: r.hours_source,
    hours: hours ? { tz: hoursDoc._tz, week: hours.week, note: hours.note ?? null } : null,
    ...(patch ? { coordsProvisional: patch.why } : {}),
    ...(STATUS_NOTES[r.id] ? { statusNote: STATUS_NOTES[r.id] } : {}),
  };
});

const out = resolve(root, 'public/spots.json');
const json = JSON.stringify({ generatedAt: new Date().toISOString(), count: spots.length, spots });
writeFileSync(out, json);

const gz = gzipSync(json).length;
const byCategory = spots.reduce((a, s) => ((a[s.category] = (a[s.category] ?? 0) + 1), a), {});
const noHours = spots.filter((s) => !s.hours).length;

console.log(`✓ public/spots.json — ${spots.length} spots`);
console.log(`  categories: ${Object.entries(byCategory).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`  hours unknown: ${noHours}`);
console.log(`  size: ${(statSync(out).size / 1024).toFixed(1)} KB → gzip ${(gz / 1024).toFixed(1)} KB (budget < 6 KB)`);
if (gz > 6 * 1024) {
  console.error('  ✗ exceeds the §11 performance budget');
  process.exit(1);
}
