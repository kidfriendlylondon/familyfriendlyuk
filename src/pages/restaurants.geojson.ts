import { restaurants } from '../data/restaurants';

export const prerender = true;

export function GET() {
  const features = restaurants.map((r, i) => ({
    type: 'Feature' as const,
    id: i,
    geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
    properties: {
      slug: r.slug,
      name: r.name,
      area: r.area,
      areaSlug: r.areaSlug,
      cuisineType: r.cuisineType,
      priceRange: r.priceRange,
      googleRating: r.googleRating,
      featured: r.featured,
      kidsMenu: r.kidsMenu === 'yes' ? 1 : 0,
      highchairs: r.highchairs === 'yes' ? 1 : 0,
      buggyAccessible: r.buggyAccessible === 'yes' ? 1 : 0,
      softPlay: r.softPlay === 'yes' ? 1 : 0,
      outdoorSpace: r.outdoorSpace === 'yes' ? 1 : 0,
      babyChanging: r.babyChanging === 'yes' ? 1 : 0,
      vegan: r.veganOptions === 'yes' ? 1 : 0,
      glutenFree: r.glutenFreeOptions === 'yes' ? 1 : 0,
      halal: r.halalOptions === 'yes' ? 1 : 0,
    },
  }));

  return new Response(
    JSON.stringify({ type: 'FeatureCollection', features }),
    { headers: { 'Content-Type': 'application/geo+json' } }
  );
}
