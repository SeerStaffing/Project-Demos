/**
 * build-centroids.mjs
 * Convert the raw country-coordinates CSV into a compact JSON lookup that the
 * news fetcher uses to place articles on the globe. Keys are lowercased country
 * names and ISO alpha-2 / alpha-3 codes so we can match GDELT's `sourcecountry`
 * field (human-readable names) as robustly as possible.
 *
 * Run:  node scripts/build-centroids.mjs
 * Reads:  data/_centroids.csv
 * Writes: data/country-centroids.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Minimal CSV parser for this well-formed, quoted file.
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const csv = readFileSync(join(root, 'data', '_centroids.csv'), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean);
csv.shift(); // drop header

/** name/code -> {name, iso2, lat, lon} */
const byKey = {};
const canonical = {}; // iso2 -> record (for alias resolution)

for (const line of csv) {
  const [name, iso2, iso3, , latS, lonS] = parseCsvLine(line);
  const lat = parseFloat(latS);
  const lon = parseFloat(lonS);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  const rec = { name, iso2, lat, lon };
  canonical[iso2] = rec;
  byKey[name.toLowerCase()] = rec;
  if (iso2) byKey[iso2.toLowerCase()] = rec;
  if (iso3) byKey[iso3.toLowerCase()] = rec;
}

// GDELT sourcecountry spellings that don't match the ISO long names in the CSV.
// Map the GDELT-style name -> an ISO2 that already exists in `canonical`.
const aliases = {
  'united states': 'US',
  'united states of america': 'US',
  'usa': 'US',
  'united kingdom': 'GB',
  'uk': 'GB',
  'great britain': 'GB',
  'russia': 'RU',
  'russian federation': 'RU',
  'south korea': 'KR',
  'korea south': 'KR',
  'republic of korea': 'KR',
  'north korea': 'KP',
  'korea north': 'KP',
  'iran': 'IR',
  'syria': 'SY',
  'vietnam': 'VN',
  'viet nam': 'VN',
  'laos': 'LA',
  'venezuela': 'VE',
  'bolivia': 'BO',
  'tanzania': 'TZ',
  'moldova': 'MD',
  'macedonia': 'MK',
  'north macedonia': 'MK',
  'czech republic': 'CZ',
  'czechia': 'CZ',
  'slovakia': 'SK',
  'united arab emirates': 'AE',
  'uae': 'AE',
  'democratic republic of the congo': 'CD',
  'congo democratic republic': 'CD',
  'dr congo': 'CD',
  'republic of the congo': 'CG',
  'congo republic': 'CG',
  'ivory coast': 'CI',
  "cote d'ivoire": 'CI',
  'cape verde': 'CV',
  'brunei': 'BN',
  'palestinian territory': 'PS',
  'palestine': 'PS',
  'west bank': 'PS',
  'gaza': 'PS',
  'burma': 'MM',
  'myanmar': 'MM',
  'swaziland': 'SZ',
  'eswatini': 'SZ',
  'east timor': 'TL',
  'timor-leste': 'TL',
  'vatican city': 'VA',
  'holy see': 'VA',
  'kosovo': 'RS', // no ISO in list; approximate with Serbia region
  'taiwan': 'TW',
  'hong kong': 'HK',
  'macau': 'MO',
};

for (const [gdeltName, iso2] of Object.entries(aliases)) {
  const rec = canonical[iso2];
  if (rec) byKey[gdeltName] = rec;
}

writeFileSync(
  join(root, 'data', 'country-centroids.json'),
  JSON.stringify(byKey, null, 0) + '\n',
);

console.log(`Wrote data/country-centroids.json with ${Object.keys(byKey).length} keys, ${Object.keys(canonical).length} countries.`);
