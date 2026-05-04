// One-off transform: read Kid Friendly London restaurants and write the
// Family Friendly UK schema. Run with: node --experimental-strip-types scripts/transform-kfl-data.ts
import { restaurants as kflRestaurants, neighbourhoodMeta } from '../../kidfriendlylondon/src/data/restaurants.ts';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT_PATH = resolve(import.meta.dirname, '../src/data/restaurants.ts');

const HEADER = `export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  area: string;
  areaSlug: string;
  city: string;
  citySlug: string;
  address: string;
  postcode: string;
  phone?: string;
  website?: string;
  cuisineType: string;
  priceRange: "£" | "££" | "$$$";
  googleRating: number;
  reviewCount: number;
  openingHours: Record<string, string>;
  lat: number;
  lng: number;
  kidsMenu: "yes" | "no" | "likely";
  highchairs: "yes" | "no" | "likely";
  outdoorSpace: "yes" | "no";
  softPlay: "yes" | "no";
  babyChanging: "yes" | "no";
  buggyAccessible: "yes" | "no" | "likely";
  noiseLevel: "quiet" | "moderate" | "lively";
  bestForAgeRange: ("babies" | "toddlers" | "primary" | "all ages")[];
  bookingRequired: "yes" | "no" | "recommended";
  veganOptions: "yes" | "no" | "likely";
  glutenFreeOptions: "yes" | "no" | "likely";
  halalOptions: "yes" | "no" | "likely";
  description: string;
  shortDescription: string;
  photos: string[];
  featured: boolean;
  openTableId?: string;
  tags: string[];
}

`;

function jsonField(key: string, value: unknown): string {
  return `${key}: ${JSON.stringify(value)}`;
}

const NAME_OVERRIDES: Record<string, string> = {
  'notting-hill': 'Notting Hill',
  'st-johns-wood': "St John's Wood",
  'st-pauls': "St Paul's",
  'east-finchley': 'East Finchley',
  'east-dulwich': 'East Dulwich',
  'east-sheen': 'East Sheen',
  'north-finchley': 'North Finchley',
  'north-kensington': 'North Kensington',
  'south-kensington': 'South Kensington',
  'west-ealing': 'West Ealing',
  'west-hampstead': 'West Hampstead',
  'west-kensington': 'West Kensington',
  'west-norwood': 'West Norwood',
  'new-southgate': 'New Southgate',
  'mill-hill': 'Mill Hill',
  'maida-vale': 'Maida Vale',
  'finsbury-park': 'Finsbury Park',
  'crouch-end': 'Crouch End',
  'crystal-palace': 'Crystal Palace',
  'covent-garden': 'Covent Garden',
  'canary-wharf': 'Canary Wharf',
  'bethnal-green': 'Bethnal Green',
  'earls-court': "Earl's Court",
  'forest-gate': 'Forest Gate',
  'forest-hill': 'Forest Hill',
  'golders-green': "Golders Green",
  'herne-hill': 'Herne Hill',
  'kentish-town': 'Kentish Town',
  'muswell-hill': 'Muswell Hill',
  'nine-elms': 'Nine Elms',
  'palmers-green': 'Palmers Green',
  'raynes-park': 'Raynes Park',
  'seven-sisters': 'Seven Sisters',
  'shepherds-bush': "Shepherd's Bush",
  'stoke-newington': 'Stoke Newington',
  'winchmore-hill': 'Winchmore Hill',
  'wood-green': 'Wood Green',
};

function deriveAreaName(slug: string): string {
  if (NAME_OVERRIDES[slug]) return NAME_OVERRIDES[slug];
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatRestaurant(r: any): string {
  const meta = neighbourhoodMeta[r.neighbourhood as keyof typeof neighbourhoodMeta];
  const area = meta?.name ?? deriveAreaName(r.neighbourhood);
  const areaSlug = r.neighbourhood;

  const lines: string[] = [];
  lines.push(`    ${jsonField('id', r.id)}, ${jsonField('slug', r.slug)}, ${jsonField('name', r.name)},`);
  lines.push(`    area: ${JSON.stringify(area)}, areaSlug: ${JSON.stringify(areaSlug)}, city: "London", citySlug: "london",`);
  lines.push(`    address: ${JSON.stringify(r.address)}, postcode: ${JSON.stringify(r.postcode)},`);
  if (r.phone || r.website) {
    const parts: string[] = [];
    if (r.phone) parts.push(`phone: ${JSON.stringify(r.phone)}`);
    if (r.website) parts.push(`website: ${JSON.stringify(r.website)}`);
    lines.push(`    ${parts.join(', ')},`);
  }
  lines.push(`    cuisineType: ${JSON.stringify(r.cuisineType)}, priceRange: ${JSON.stringify(r.priceRange)},`);
  lines.push(`    googleRating: ${r.googleRating}, reviewCount: ${r.reviewCount},`);
  lines.push(`    openingHours: ${JSON.stringify(r.openingHours)},`);
  lines.push(`    lat: ${r.lat}, lng: ${r.lng},`);
  lines.push(`    kidsMenu: ${JSON.stringify(r.kidsMenu)}, highchairs: ${JSON.stringify(r.highchairs)}, outdoorSpace: ${JSON.stringify(r.outdoorSpace)}, softPlay: ${JSON.stringify(r.softPlay)}, babyChanging: ${JSON.stringify(r.babyChanging)}, buggyAccessible: ${JSON.stringify(r.buggyAccessible)}, noiseLevel: ${JSON.stringify(r.noiseLevel)},`);
  lines.push(`    bestForAgeRange: ${JSON.stringify(r.bestForAgeRange)}, bookingRequired: ${JSON.stringify(r.bookingRequired)},`);
  lines.push(`    veganOptions: ${JSON.stringify(r.veganOptions)}, glutenFreeOptions: ${JSON.stringify(r.glutenFreeOptions)}, halalOptions: ${JSON.stringify(r.halalOptions)},`);
  lines.push(`    description: ${JSON.stringify(r.description)},`);
  lines.push(`    shortDescription: ${JSON.stringify(r.shortDescription)},`);
  lines.push(`    photos: ${JSON.stringify(r.photos)},`);
  if (r.openTableId) {
    lines.push(`    featured: ${r.featured}, openTableId: ${JSON.stringify(r.openTableId)}, tags: ${JSON.stringify(r.tags)},`);
  } else {
    lines.push(`    featured: ${r.featured}, tags: ${JSON.stringify(r.tags)},`);
  }

  return `  {\n${lines.join('\n')}\n  },`;
}

const sections: Record<string, any[]> = {};
for (const r of kflRestaurants) {
  const slug = (r as any).neighbourhood as string;
  (sections[slug] ||= []).push(r);
}

const order = ['clapham', 'notting-hill', 'islington', 'richmond', 'shoreditch'];
const orderedSlugs = [...order, ...Object.keys(sections).filter(s => !order.includes(s))];

let body = 'export const restaurants: Restaurant[] = [\n';
for (const slug of orderedSlugs) {
  const list = sections[slug];
  if (!list?.length) continue;
  const sectionName = deriveAreaName(slug).toUpperCase();
  body += `  // ${sectionName}\n`;
  for (const r of list) body += formatRestaurant(r) + '\n';
}
body += '];\n';

const HELPERS = `
export function getAreaStats() {
  const stats: Record<string, { name: string; citySlug: string; count: number; featured: Restaurant[] }> = {};
  for (const r of restaurants) {
    if (!stats[r.areaSlug]) {
      stats[r.areaSlug] = { name: r.area, citySlug: r.citySlug, count: 0, featured: [] };
    }
    stats[r.areaSlug].count++;
    if (r.featured) stats[r.areaSlug].featured.push(r);
  }
  return stats;
}

export function getCityStats() {
  const stats: Record<string, { name: string; count: number; areas: string[] }> = {};
  for (const r of restaurants) {
    if (!stats[r.citySlug]) {
      stats[r.citySlug] = { name: r.city, count: 0, areas: [] };
    }
    stats[r.citySlug].count++;
    if (!stats[r.citySlug].areas.includes(r.areaSlug)) {
      stats[r.citySlug].areas.push(r.areaSlug);
    }
  }
  return stats;
}

export function getRestaurantsByArea(areaSlug: string) {
  return restaurants.filter(r => r.areaSlug === areaSlug);
}

export function getRestaurantsByCity(citySlug: string) {
  return restaurants.filter(r => r.citySlug === citySlug);
}

export function getFeaturedRestaurants() {
  return restaurants.filter(r => r.featured);
}

export function getNearby(lat: number, lng: number, limit = 4, excludeSlug?: string) {
  return restaurants
    .filter(r => r.slug !== excludeSlug)
    .map(r => ({ ...r, dist: Math.sqrt((r.lat - lat) ** 2 + (r.lng - lng) ** 2) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);
}
`;

writeFileSync(OUT_PATH, HEADER + body + HELPERS);
console.log(`Wrote ${kflRestaurants.length} restaurants to ${OUT_PATH}`);
