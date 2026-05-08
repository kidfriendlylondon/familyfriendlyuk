/**
 * Fetch up to 3 Google Places photos for the top N restaurants by review
 * count, save them as /public/images/restaurants/{slug}-{1|2|3}.jpg, and
 * patch src/data/restaurants.ts with the local paths.
 *
 * Mirrors the Kid Friendly London pattern (Places API "New" v1 endpoints):
 *   - POST  /v1/places:searchText  → place id + photo references
 *   - GET   /v1/{photoName}/media  → image bytes (follows redirect)
 *
 * Usage:
 *   GOOGLE_PLACES_API_KEY=<key> node scripts/fetch-photos.mjs [--limit 500] [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images', 'restaurants');
const DATA_FILE = path.join(ROOT, 'src', 'data', 'restaurants.ts');

const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 500;
const DRY = args.includes('--dry-run');

const KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!KEY) {
  console.error('ERROR: Set GOOGLE_PLACES_API_KEY environment variable.');
  process.exit(1);
}

fs.mkdirSync(IMAGES_DIR, { recursive: true });

// ── Pricing constants for the cost report ─────────────────────────────
const COST_TEXT_SEARCH = 0.032;   // Places API "Pro" SKU per request (USD)
const COST_PHOTO = 0.007;         // Place Photo per request (USD)

// ── Parse restaurants.ts to get the top N candidates ──────────────────
const TS = fs.readFileSync(DATA_FILE, 'utf8');
const arrStart = TS.indexOf('export const restaurants:');
const arrOpen = TS.indexOf('[', arrStart);
const arrClose = TS.indexOf('\n];\n', arrOpen);
const body = TS.slice(arrOpen + 1, arrClose);

function field(block, name) {
  const m = block.match(new RegExp(`\\b${name}:\\s*"([^"]*)"`));
  return m ? m[1] : '';
}
function fieldInt(block, name) {
  const m = block.match(new RegExp(`\\b${name}:\\s*(-?\\d+(?:\\.\\d+)?)`));
  return m ? Number(m[1]) : 0;
}

// Walk top-level "  { ... \n  }," blocks. Body lines look like
//   "\n  {\n    id: ...\n    ...\n  },\n"
const blocks = [];
const re = /\n  \{\n([\s\S]*?)\n  \},/g;
let m;
while ((m = re.exec(body)) !== null) {
  const text = m[0];
  blocks.push({
    slug: field(text, 'slug'),
    name: field(text, 'name'),
    postcode: field(text, 'postcode'),
    area: field(text, 'area'),
    reviewCount: fieldInt(text, 'reviewCount'),
    photos: text.match(/photos:\s*\[(.*?)\]/)?.[1] ?? '',
  });
}
console.log(`Parsed ${blocks.length} restaurant blocks from restaurants.ts`);

// Skip restaurants that already have local photos (re-runs are idempotent)
const candidates = blocks
  .filter(b => b.slug && !b.photos.includes('/images/restaurants/'))
  .sort((a, b) => b.reviewCount - a.reviewCount)
  .slice(0, LIMIT);

console.log(`Top ${candidates.length} by review count, no local photos yet`);
console.log(`Estimated cost (worst case):`);
console.log(`  ${candidates.length} text searches × $${COST_TEXT_SEARCH} = $${(candidates.length * COST_TEXT_SEARCH).toFixed(2)}`);
console.log(`  up to ${candidates.length * 3} photos × $${COST_PHOTO} = $${(candidates.length * 3 * COST_PHOTO).toFixed(2)}`);
console.log(`  TOTAL up to $${(candidates.length * COST_TEXT_SEARCH + candidates.length * 3 * COST_PHOTO).toFixed(2)} USD`);

if (DRY) {
  console.log('\n--dry-run set — exiting before any API calls.');
  process.exit(0);
}

// ── Places API helpers ────────────────────────────────────────────────
const PLACES_BASE = 'https://places.googleapis.com/v1';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function textSearch(query) {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.photos',
      'Referer': 'https://familyfriendlyuk.co.uk/',
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1, regionCode: 'GB' }),
  });
  if (!res.ok) throw new Error(`textSearch HTTP ${res.status}`);
  const json = await res.json();
  return json.places?.[0] ?? null;
}

async function downloadPhoto(photoName, destPath) {
  // Step 1: ask the Places API for the photoUri (skipHttpRedirect=true).
  // The Places call needs the Referer header because the API key is HTTP-
  // referrer restricted; the redirect-follow path ends up unauthenticated
  // and 404s, so we resolve the URI ourselves.
  const metaUrl = `${PLACES_BASE}/${photoName}/media?maxWidthPx=1200&skipHttpRedirect=true&key=${KEY}`;
  const metaRes = await fetch(metaUrl, {
    headers: { 'Referer': 'https://familyfriendlyuk.co.uk/' },
  });
  if (!metaRes.ok) throw new Error(`photo meta HTTP ${metaRes.status}`);
  const meta = await metaRes.json();
  if (!meta.photoUri) throw new Error('photo meta returned no photoUri');

  // Step 2: fetch the CDN URI — public, no auth required.
  const imgRes = await fetch(meta.photoUri, { redirect: 'follow' });
  if (!imgRes.ok) throw new Error(`photo CDN HTTP ${imgRes.status}`);
  const buf = await imgRes.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buf));
}

// ── Main loop ─────────────────────────────────────────────────────────
const results = {}; // slug → ['/images/restaurants/...']
let fetchedCount = 0;
let notFoundCount = 0;
let noPhotosCount = 0;
let errorCount = 0;
let textSearchCalls = 0;
let photoCalls = 0;

const startTime = Date.now();

for (let i = 0; i < candidates.length; i++) {
  const r = candidates[i];
  process.stdout.write(`[${i + 1}/${candidates.length}] ${r.name} (${r.postcode}) ... `);

  try {
    const query = `${r.name} ${r.postcode}`;
    const place = await textSearch(query);
    textSearchCalls++;

    if (!place) {
      console.log('not found');
      notFoundCount++;
      results[r.slug] = [];
      await sleep(200);
      continue;
    }

    const photos = place.photos ?? [];
    if (!photos.length) {
      console.log(`no photos (${place.displayName?.text ?? 'matched'})`);
      noPhotosCount++;
      results[r.slug] = [];
      await sleep(200);
      continue;
    }

    const localPaths = [];
    const toDownload = photos.slice(0, 3);
    for (let j = 0; j < toDownload.length; j++) {
      const filename = `${r.slug}-${j + 1}.jpg`;
      const destPath = path.join(IMAGES_DIR, filename);
      await downloadPhoto(toDownload[j].name, destPath);
      photoCalls++;
      localPaths.push(`/images/restaurants/${filename}`);
      await sleep(120);
    }

    results[r.slug] = localPaths;
    fetchedCount++;
    console.log(`✓ ${localPaths.length} photo(s)`);
  } catch (err) {
    console.log(`error: ${err.message}`);
    errorCount++;
    results[r.slug] = [];
  }

  await sleep(250);
}

const elapsed = Math.round((Date.now() - startTime) / 1000);

// ── Patch restaurants.ts ──────────────────────────────────────────────
console.log('\nPatching src/data/restaurants.ts ...');
let src = fs.readFileSync(DATA_FILE, 'utf8');
let patched = 0;

for (const [slug, paths] of Object.entries(results)) {
  if (!paths.length) continue;
  const photosArray = paths.map(p => `"${p}"`).join(',');
  const replacement = `photos: [${photosArray}]`;
  const slugMarker = `slug: "${slug}"`;
  const slugIdx = src.indexOf(slugMarker);
  if (slugIdx === -1) { console.warn(`  slug not found: ${slug}`); continue; }
  const after = src.indexOf('\n', slugIdx);
  const photosIdx = src.indexOf('photos: [', after);
  const photosEnd = src.indexOf(']', photosIdx) + 1;
  if (photosIdx === -1 || photosEnd === 0) { console.warn(`  photos field not found: ${slug}`); continue; }
  src = src.slice(0, photosIdx) + replacement + src.slice(photosEnd);
  patched++;
}

fs.writeFileSync(DATA_FILE, src, 'utf8');

// ── Report ────────────────────────────────────────────────────────────
const actualCost = textSearchCalls * COST_TEXT_SEARCH + photoCalls * COST_PHOTO;
console.log('\n=== Photo backfill complete ===');
console.log(`Restaurants processed   : ${candidates.length}`);
console.log(`With photos (≥1)        : ${fetchedCount}`);
console.log(`No matching place       : ${notFoundCount}`);
console.log(`Place found, no photos  : ${noPhotosCount}`);
console.log(`API errors              : ${errorCount}`);
console.log(`Text search calls       : ${textSearchCalls} ($${(textSearchCalls * COST_TEXT_SEARCH).toFixed(2)})`);
console.log(`Photo download calls    : ${photoCalls} ($${(photoCalls * COST_PHOTO).toFixed(2)})`);
console.log(`TOTAL ACTUAL COST       : $${actualCost.toFixed(2)} USD`);
console.log(`Elapsed                 : ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
console.log(`Patched in restaurants.ts: ${patched}`);

// Sample of 10 restaurants now with photos
const sampled = Object.entries(results)
  .filter(([, p]) => p.length > 0)
  .slice(0, 10);
console.log(`\nSample of ${sampled.length} restaurants now with photos:`);
for (const [slug, paths] of sampled) {
  const r = candidates.find(c => c.slug === slug);
  console.log(`  ${r.name} (${r.area}) — ${paths.length} photo(s)`);
}
