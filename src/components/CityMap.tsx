import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { locateUser, geocodePostcode, looksLikeUkPostcode } from '../lib/locate';
import { buildMarkerPopupHtml } from '../lib/popup';

interface Filters {
  kidsMenu: boolean;
  highchairs: boolean;
  buggyFriendly: boolean;
  softPlay: boolean;
  outdoorSpace: boolean;
  babyChanging: boolean;
  vegan: boolean;
  glutenFree: boolean;
  halal: boolean;
}

const DEFAULT_FILTERS: Filters = {
  kidsMenu: false, highchairs: false, buggyFriendly: false, softPlay: false,
  outdoorSpace: false, babyChanging: false, vegan: false, glutenFree: false, halal: false,
};

const FILTER_PROP_MAP: Record<keyof Filters, string> = {
  kidsMenu: 'kidsMenu',
  highchairs: 'highchairs',
  buggyFriendly: 'buggyAccessible',
  softPlay: 'softPlay',
  outdoorSpace: 'outdoorSpace',
  babyChanging: 'babyChanging',
  vegan: 'vegan',
  glutenFree: 'glutenFree',
  halal: 'halal',
};

const FILTER_LABELS: { key: keyof Filters; label: string }[] = [
  { key: 'kidsMenu', label: 'Kids menu' },
  { key: 'highchairs', label: 'Highchairs' },
  { key: 'buggyFriendly', label: 'Buggy friendly' },
  { key: 'softPlay', label: 'Soft play' },
  { key: 'outdoorSpace', label: 'Outdoor space' },
  { key: 'babyChanging', label: 'Baby changing' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'glutenFree', label: 'Gluten free' },
  { key: 'halal', label: 'Halal' },
];

const TOKEN = import.meta.env.PUBLIC_MAPBOX_TOKEN || '';
const SOURCE_ID = 'restaurants';
const DATA_URL = '/restaurants.geojson';

type Feature = {
  type: 'Feature';
  id?: number;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, any>;
};
type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };

function passesCheckboxFilters(props: Record<string, any>, filters: Filters): boolean {
  return (Object.keys(filters) as (keyof Filters)[]).every(k => {
    if (!filters[k]) return true;
    return props[FILTER_PROP_MAP[k]] === 1;
  });
}

export default function CityMap({ areaSlug, areaName }: { areaSlug: string; areaName: string }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const cityFeaturesRef = useRef<Feature[] | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [activeCount, setActiveCount] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [postcode, setPostcode] = useState('');
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const [postcodeBusy, setPostcodeBusy] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !TOKEN) return;
    mapboxgl.accessToken = TOKEN;

    // Sensible default while data loads — UK center, low zoom
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-3, 54.5],
      zoom: 5,
      minZoom: 4,
      maxZoom: 18,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', async () => {
      try {
        const res = await fetch(DATA_URL);
        const fc: FeatureCollection = await res.json();
        const cityFeatures = fc.features.filter(f => f.properties.areaSlug === areaSlug);
        cityFeaturesRef.current = cityFeatures;

        const cityFc: FeatureCollection = { type: 'FeatureCollection', features: cityFeatures };

        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: cityFc,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 60,
        });

        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step', ['get', 'point_count'],
              '#9bbb6e', 25, '#5d8e3e', 100, '#2D5016',
            ],
            'circle-radius': ['step', ['get', 'point_count'], 18, 25, 24, 100, 32],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.92,
          },
        });

        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 13,
          },
          paint: { 'text-color': '#ffffff' },
        });

        map.addLayer({
          id: 'unclustered-point',
          type: 'circle',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['case', ['==', ['get', 'featured'], true], '#C4622D', '#2D5016'],
            'circle-radius': ['case', ['==', ['get', 'featured'], true], 8, 6],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });

        map.on('click', 'clusters', (e) => {
          const feats = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
          const clusterId = feats[0].properties?.cluster_id;
          const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err || zoom == null) return;
            const coords = (feats[0].geometry as any).coordinates as [number, number];
            map.easeTo({ center: coords, zoom });
          });
        });

        map.on('click', 'unclustered-point', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const coords = (f.geometry as any).coordinates.slice() as [number, number];
          const p = f.properties as any;
          if (popupRef.current) popupRef.current.remove();
          popupRef.current = new mapboxgl.Popup({ offset: 12, maxWidth: '280px' })
            .setLngLat(coords)
            .setHTML(buildMarkerPopupHtml(p))
            .addTo(map);
        });

        const setPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
        const clearPointer = () => { map.getCanvas().style.cursor = ''; };
        map.on('mouseenter', 'clusters', setPointer);
        map.on('mouseleave', 'clusters', clearPointer);
        map.on('mouseenter', 'unclustered-point', setPointer);
        map.on('mouseleave', 'unclustered-point', clearPointer);

        // Fit map to the city's restaurants
        if (cityFeatures.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          for (const f of cityFeatures) {
            bounds.extend(f.geometry.coordinates as [number, number]);
          }
          map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 });
        }

        setActiveCount(cityFeatures.length);
        setDataReady(true);
      } catch (err) {
        console.error('Failed to load restaurants.geojson', err);
      }
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [areaSlug]);

  // Apply filters: update map source AND broadcast to sibling listings
  useEffect(() => {
    if (!mapRef.current?.loaded() || !cityFeaturesRef.current) return;
    const source = mapRef.current.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const filtered = cityFeaturesRef.current.filter(f => passesCheckboxFilters(f.properties, filters));
    source.setData({ type: 'FeatureCollection', features: filtered });
    setActiveCount(filtered.length);

    // Tell the sibling listings grid to filter its cards
    window.dispatchEvent(new CustomEvent('ffuk-city-filters', { detail: filters }));
  }, [filters, dataReady]);

  // Place (or move) a blue "you are here" dot on the map at the given
  // coordinates. Reuses the same marker on subsequent calls.
  const placeUserDot = (lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([lng, lat]);
    } else {
      const dot = document.createElement('div');
      dot.className = 'map-user-dot';
      dot.setAttribute('aria-label', 'Your location');
      userMarkerRef.current = new mapboxgl.Marker({ element: dot })
        .setLngLat([lng, lat])
        .addTo(map);
    }
  };

  const handleNearMe = async () => {
    setLocating(true);
    setLocateError(null);
    const result = await locateUser();
    setLocating(false);
    if (result.kind === 'success') {
      placeUserDot(result.lng, result.lat);
      mapRef.current?.flyTo({ center: [result.lng, result.lat], zoom: 13, essential: true });
    } else if (result.kind === 'blocked') {
      setLocateError('Browser blocked location — try entering your postcode instead.');
    } else {
      setLocateError("Couldn't get a location fix. Try entering your postcode.");
    }
  };

  const handlePostcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostcodeError(null);
    const value = postcode.trim();
    if (!value) return;
    if (!looksLikeUkPostcode(value)) {
      setPostcodeError("That doesn't look like a UK postcode.");
      return;
    }
    setPostcodeBusy(true);
    const hit = await geocodePostcode(value, TOKEN);
    setPostcodeBusy(false);
    if (!hit) {
      setPostcodeError("Couldn't find that postcode.");
      return;
    }
    placeUserDot(hit.lng, hit.lat);
    mapRef.current?.flyTo({ center: [hit.lng, hit.lat], zoom: 13, essential: true });
  };

  const updateFilter = (key: keyof Filters, value: boolean) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const activeFilterCount = Object.values(filters).filter(v => v).length;

  if (!TOKEN) {
    return (
      <div style={{ background: '#eef3e8', borderRadius: '12px', padding: '48px', textAlign: 'center', color: '#2D5016' }}>
        <p style={{ fontFamily: 'Georgia,serif', fontSize: '1.25rem', marginBottom: '12px' }}>Map coming soon</p>
        <p style={{ color: '#6b6457', fontSize: '0.9375rem' }}>Add your Mapbox token to <code>PUBLIC_MAPBOX_TOKEN</code> in Vercel environment variables to enable the interactive map.</p>
      </div>
    );
  }

  return (
    <div className="cm">
      <div className="cm-card">
        <div className="cm-filter-checks">
          {FILTER_LABELS.map(({ key, label }) => (
            <label key={key} className="cm-filter-check">
              <input
                type="checkbox"
                checked={filters[key]}
                onChange={e => updateFilter(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
        {activeFilterCount > 0 && (
          <div className="cm-card-actions">
            <button type="button" className="cm-clear-btn" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div className="cm-map-controls">
        <button
          className={`cm-btn cm-btn--near-me ${locating ? 'loading' : ''}`}
          onClick={handleNearMe}
          disabled={locating}
        >
          {locating ? '⌛ Finding you…' : '📍 Near me'}
        </button>

        <form className="cm-postcode" onSubmit={handlePostcodeSubmit}>
          <label htmlFor="cm-postcode-input" className="cm-postcode-label">Or enter your postcode</label>
          <input
            id="cm-postcode-input"
            type="text"
            inputMode="text"
            autoComplete="postal-code"
            placeholder="e.g. SW4 0JU"
            value={postcode}
            onChange={e => { setPostcode(e.target.value); setPostcodeError(null); }}
            className="cm-postcode-input"
          />
          <button type="submit" className="cm-btn" disabled={postcodeBusy}>
            {postcodeBusy ? 'Finding…' : 'Go'}
          </button>
        </form>

        <span className="cm-map-count">
          {dataReady ? `${activeCount.toLocaleString()} restaurant${activeCount !== 1 ? 's' : ''} in ${areaName}` : 'Loading…'}
        </span>
      </div>

      {(locateError || postcodeError) && (
        <div className="cm-locate-error" role="status">
          {locateError || postcodeError}
        </div>
      )}

      <div ref={mapContainer} className="cm-map" />

      <style>{`
        .cm { display: flex; flex-direction: column; gap: 12px; }
        .cm-card {
          background: white;
          border-radius: 16px;
          padding: 18px 22px;
          box-shadow: 0 4px 24px rgba(45,80,22,0.10);
          border: 1px solid #e8e2d9;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .cm-filter-checks { display: flex; flex-wrap: wrap; gap: 8px; }
        .cm-filter-check {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          border: 1.5px solid #e8e2d9;
          border-radius: 20px;
          font-size: 0.875rem;
          color: #1A1A1A;
          cursor: pointer;
          transition: all 0.15s;
          user-select: none;
        }
        .cm-filter-check:hover { border-color: #2D5016; background: #eef3e8; }
        .cm-filter-check input { accent-color: #2D5016; }
        .cm-card-actions { display: flex; justify-content: flex-end; }
        .cm-clear-btn {
          background: transparent;
          color: #C4622D;
          border: 1.5px solid #C4622D;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 0.875rem;
          font-family: inherit;
          cursor: pointer;
        }
        .cm-clear-btn:hover { background: #fdf0e8; }
        .cm-map-controls {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          padding: 4px 4px 0;
        }
        .cm-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.875rem;
          font-weight: 500;
          border: 1.5px solid #e8e2d9;
          background: #fff;
          color: #1A1A1A;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
        }
        .cm-btn--near-me { background: #2D5016; color: white; border-color: #2D5016; }
        .cm-btn--near-me:hover { background: #3d6b1e; }
        .cm-btn:disabled { opacity: 0.6; cursor: default; }
        .cm-map-count { font-size: 0.875rem; color: #6b6457; }
        .cm-postcode {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .cm-postcode-label {
          font-size: 0.8125rem;
          color: #6b6457;
        }
        .cm-postcode-input {
          padding: 8px 10px;
          border: 1.5px solid #e8e2d9;
          border-radius: 6px;
          font-size: 0.875rem;
          background: white;
          color: #1A1A1A;
          width: 7.5em;
          font-family: inherit;
          text-transform: uppercase;
        }
        .cm-postcode-input:focus { outline: none; border-color: #2D5016; }
        .cm-locate-error {
          padding: 8px 12px;
          background: #fdf0e8;
          border: 1px solid #C4622D;
          border-radius: 6px;
          color: #1A1A1A;
          font-size: 0.875rem;
        }
        .cm-map {
          height: 460px;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #e8e2d9;
        }
        @media (max-width: 600px) {
          .cm-map { height: 360px; }
        }
      `}</style>
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
