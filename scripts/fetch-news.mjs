/**
 * fetch-news.mjs
 * Aggregate current global news from the GDELT DOC 2.0 API (free, no API key)
 * and geolocate each article by its source country, producing data/news.json
 * that the globe front-end renders.
 *
 * Why server-side (GitHub Action / local) instead of from the browser?
 *   - GDELT has no CORS headers, so a browser fetch is blocked.
 *   - GDELT rate-limits by IP (~1 request / 5s). A scheduled job can pace itself;
 *     thousands of site visitors cannot share one budget.
 *
 * Geolocation granularity is country-level (GDELT artlist exposes `sourcecountry`).
 * We map that to a country centroid and add small deterministic jitter so many
 * articles from one country fan out into a readable cluster instead of stacking.
 *
 * Run:  node scripts/fetch-news.mjs
 * Env:  NEWS_TIMESPAN (default "24h"), NEWS_MAX_PER_QUERY (default 75)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const TIMESPAN = process.env.NEWS_TIMESPAN || '24h';
const MAX_PER_QUERY = Number(process.env.NEWS_MAX_PER_QUERY || 75);
const REQUEST_SPACING_MS = 6000; // GDELT asks for <= 1 req / 5s; be polite.
const MIN_ARTICLES_TO_WRITE = 15; // don't clobber good data with a failed run.

// Topic + region queries chosen to paint a broad, current global picture.
// English-language filter keeps headlines readable while still surfacing outlets
// worldwide (Times of India, Al Jazeera, SCMP, Guardian, etc.).
const QUERIES = [
  { topic: 'Top', q: '(breaking OR headline) sourcelang:eng' },
  { topic: 'Politics', q: '(election OR government OR parliament) sourcelang:eng' },
  { topic: 'Conflict', q: '(conflict OR military OR ceasefire) sourcelang:eng' },
  { topic: 'Economy', q: '(economy OR inflation OR markets) sourcelang:eng' },
  { topic: 'Climate', q: '(climate OR wildfire OR flooding) sourcelang:eng' },
  { topic: 'Technology', q: '(technology OR artificial intelligence) sourcelang:eng' },
  { topic: 'Health', q: '(health OR outbreak OR hospital) sourcelang:eng' },
  { topic: 'Science', q: '(science OR space OR research) sourcelang:eng' },
  { topic: 'Sports', q: '(football OR olympics OR cricket) sourcelang:eng' },
  { topic: 'Africa', q: 'Africa sourcelang:eng' },
  { topic: 'Asia', q: 'Asia sourcelang:eng' },
  { topic: 'Europe', q: 'Europe sourcelang:eng' },
  { topic: 'Middle East', q: '"Middle East" sourcelang:eng' },
  { topic: 'Americas', q: '(America OR "Latin America") sourcelang:eng' },
];

const centroids = JSON.parse(
  readFileSync(join(root, 'data', 'country-centroids.json'), 'utf8'),
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Deterministic 32-bit string hash -> used for stable per-article jitter.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function jitter(seed, spreadDeg = 3) {
  const a = (seed % 1000) / 1000;         // 0..1
  const b = ((seed >>> 10) % 1000) / 1000; // 0..1
  return {
    dLat: (a - 0.5) * 2 * spreadDeg,
    dLon: (b - 0.5) * 2 * spreadDeg,
  };
}

function locate(country, url) {
  if (!country) return null;
  const rec = centroids[country.toLowerCase()];
  if (!rec) return null;
  const { dLat, dLon } = jitter(hash(url || country));
  const lat = Math.max(-85, Math.min(85, rec.lat + dLat));
  const lon = ((rec.lon + dLon + 540) % 360) - 180;
  return { lat, lon, countryName: rec.name };
}

async function fetchQuery({ topic, q }) {
  const url =
    'https://api.gdeltproject.org/api/v2/doc/doc?' +
    new URLSearchParams({
      query: q,
      mode: 'artlist',
      format: 'json',
      maxrecords: String(MAX_PER_QUERY),
      timespan: TIMESPAN,
      sort: 'datedesc',
    }).toString();

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Project-Demos-NewsGlobe/1.0 (github pages demo)' },
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`  [${topic}] HTTP ${res.status}: ${text.slice(0, 80)}`);
      return [];
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn(`  [${topic}] non-JSON response (rate limited?): ${text.slice(0, 80)}`);
      return [];
    }
    const arts = Array.isArray(data.articles) ? data.articles : [];
    console.log(`  [${topic}] ${arts.length} articles`);
    return arts.map((a) => ({ ...a, _topic: topic }));
  } catch (err) {
    console.warn(`  [${topic}] fetch error: ${err.message}`);
    return [];
  }
}

// GDELT seendate looks like "20260707T143000Z" -> ISO string.
function parseSeenDate(s) {
  if (!s || s.length < 15) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function main() {
  console.log(`Fetching news from GDELT (timespan=${TIMESPAN}, ${QUERIES.length} queries)...`);
  const seen = new Set();
  const unlocated = new Set();
  const articles = [];

  for (let i = 0; i < QUERIES.length; i++) {
    const raw = await fetchQuery(QUERIES[i]);
    for (const a of raw) {
      if (!a.url || seen.has(a.url)) continue;
      const loc = locate(a.sourcecountry, a.url);
      if (!loc) {
        if (a.sourcecountry) unlocated.add(a.sourcecountry);
        continue;
      }
      seen.add(a.url);
      articles.push({
        title: a.title || '(untitled)',
        url: a.url,
        domain: a.domain || '',
        country: loc.countryName,
        topic: a._topic,
        lang: a.language || '',
        image: a.socialimage || '',
        date: parseSeenDate(a.seendate),
        lat: Number(loc.lat.toFixed(4)),
        lng: Number(loc.lon.toFixed(4)),
      });
    }
    if (i < QUERIES.length - 1) await sleep(REQUEST_SPACING_MS);
  }

  if (unlocated.size) {
    console.log(`Unlocated source countries (skipped): ${[...unlocated].join(', ')}`);
  }

  console.log(`Collected ${articles.length} geolocated articles across ${new Set(articles.map((a) => a.country)).size} countries.`);

  const outPath = join(root, 'data', 'news.json');
  if (articles.length < MIN_ARTICLES_TO_WRITE && existsSync(outPath)) {
    console.warn(
      `Only ${articles.length} articles (< ${MIN_ARTICLES_TO_WRITE}); keeping existing data/news.json.`,
    );
    process.exitCode = 0;
    return;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'GDELT DOC 2.0 API',
    timespan: TIMESPAN,
    count: articles.length,
    articles: articles.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
}

main();
