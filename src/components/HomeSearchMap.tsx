import { useEffect, useMemo, useRef, useState } from 'react';
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
const UK_CENTER: [number, number] = [-3, 54.5];
const UK_ZOOM = 5;

type Feature = {
  type: 'Feature';
  id?: number;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, any>;
};
type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };

type Area = {
  slug: string;
  name: string;
  count: number;
  lng: number;
  lat: number;
};

function applyFilters(fc: FeatureCollection, filters: Filters, areaSlug: string | null): FeatureCollection {
  const active = (Object.keys(filters) as (keyof Filters)[]).filter(k => filters[k]);
  if (active.length === 0 && !areaSlug) return fc;
  return {
    type: 'FeatureCollection',
    features: fc.features.filter(f => {
      if (areaSlug && f.properties.areaSlug !== areaSlug) return false;
      return active.every(k => f.properties[FILTER_PROP_MAP[k]] === 1);
    }),
  };
}

function buildAreaIndex(fc: FeatureCollection): Area[] {
  const acc = new Map<string, { name: string; count: number; sumLng: number; sumLat: number }>();
  for (const f of fc.features) {
    const slug = f.properties.areaSlug;
    if (!slug) continue;
    const e = acc.get(slug);
    const [lng, lat] = f.geometry.coordinates;
    if (e) {
      e.count++;
      e.sumLng += lng;
      e.sumLat += lat;
    } else {
      acc.set(slug, { name: f.properties.area, count: 1, sumLng: lng, sumLat: lat });
    }
  }
  return Array.from(acc.entries()).map(([slug, v]) => ({
    slug,
    name: v.name,
    count: v.count,
    lng: v.sumLng / v.count,
    lat: v.sumLat / v.count,
  }));
}

export default function HomeSearchMap({ totalCount }: { totalCount: number }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const dataRef = useRef<FeatureCollection | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [areas, setAreas] = useState<Area[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [activeCount, setActiveCount] = useState(totalCount);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [postcode, setPostcode] = useState('');
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const [postcodeBusy, setPostcodeBusy] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  // Suggestions for the typeahead dropdown
  const suggestions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    const startsWith: Area[] = [];
    const contains: Area[] = [];
    for (const a of areas) {
      const n = a.name.toLowerCase();
      if (n.startsWith(q)) startsWith.push(a);
      else if (n.includes(q)) contains.push(a);
    }
    startsWith.sort((a, b) => b.count - a.count);
    contains.sort((a, b) => b.count - a.count);
    return [...startsWith, ...contains].slice(0, 8);
  }, [searchTerm, areas]);

  // Initialise map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !TOKEN) return;
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: UK_CENTER,
      zoom: UK_ZOOM,
      minZoom: 4,
      maxZoom: 18,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', async () => {
      try {
        const res = await fetch(DATA_URL);
        const fc: FeatureCollection = await res.json();
        dataRef.current = fc;
        setAreas(buildAreaIndex(fc));

        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: fc,
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

        setActiveCount(fc.features.length);
        setDataReady(true);
      } catch (err) {
        console.error('Failed to load restaurants.geojson', err);
      }
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Re-apply filter checkboxes to the map source
  useEffect(() => {
    if (!mapRef.current?.loaded() || !dataRef.current) return;
    const source = mapRef.current.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const filtered = applyFilters(dataRef.current, filters, null);
    source.setData(filtered);
    setActiveCount(filtered.features.length);
  }, [filters, dataReady]);

  // Close dropdown on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pickArea(a: Area) {
    // The search box is a navigation tool — go to the area's listing page.
    window.location.href = `/area/${a.slug}`;
  }

  function clearAll() {
    setFilters(DEFAULT_FILTERS);
    setSearchTerm('');
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && searchTerm) setDropdownOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const a = suggestions[highlightIdx];
      if (a) pickArea(a);
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  }

  const updateFilter = (key: keyof Filters, value: boolean) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const activeFilterCount = Object.values(filters).filter(v => v).length;
  const hasAnyControl = activeFilterCount > 0;

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

  if (!TOKEN) {
    return (
      <div style={{ background: '#eef3e8', borderRadius: '12px', padding: '48px', textAlign: 'center', color: '#2D5016' }}>
        <p style={{ fontFamily: 'Georgia,serif', fontSize: '1.25rem', marginBottom: '12px' }}>Map coming soon</p>
        <p style={{ color: '#6b6457', fontSize: '0.9375rem' }}>Add your Mapbox token to <code>PUBLIC_MAPBOX_TOKEN</code> in Vercel environment variables to enable the interactive map.</p>
      </div>
    );
  }

  return (
    <div className="hsm">
      {/* Search & filter card */}
      <div className="hsm-card">
        <div className="hsm-search-wrap" ref={dropdownRef}>
          <span className="hsm-search-icon" aria-hidden="true">🔍</span>
          <input
            type="text"
            className="hsm-search-input"
            value={searchTerm}
            placeholder="Jump to a UK city or town…"
            onChange={e => { setSearchTerm(e.target.value); setDropdownOpen(true); setHighlightIdx(0); }}
            onFocus={() => { if (suggestions.length > 0) setDropdownOpen(true); }}
            onKeyDown={handleKey}
            autoComplete="off"
            role="combobox"
            aria-expanded={dropdownOpen}
            aria-controls="hsm-suggestions"
            aria-autocomplete="list"
          />

          {dropdownOpen && suggestions.length > 0 && (
            <ul id="hsm-suggestions" className="hsm-suggestions" role="listbox">
              {suggestions.map((a, i) => (
                <li
                  key={a.slug}
                  role="option"
                  aria-selected={i === highlightIdx}
                  className={i === highlightIdx ? 'is-highlighted' : ''}
                  onMouseEnter={() => setHighlightIdx(i)}
                  onMouseDown={(e) => { e.preventDefault(); pickArea(a); }}
                >
                  <span className="hsm-suggestion-name">{a.name}</span>
                  <span className="hsm-suggestion-count">{a.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="hsm-filter-checks">
          {FILTER_LABELS.map(({ key, label }) => (
            <label key={key} className="hsm-filter-check">
              <input
                type="checkbox"
                checked={filters[key]}
                onChange={e => updateFilter(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>

        {hasAnyControl && (
          <div className="hsm-card-actions">
            <button type="button" className="hsm-clear-btn" onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="hsm-map-controls">
        <button
          className={`hsm-btn hsm-btn--near-me ${locating ? 'loading' : ''}`}
          onClick={handleNearMe}
          disabled={locating}
        >
          {locating ? '⌛ Finding you…' : '📍 Near me'}
        </button>

        <form className="hsm-postcode" onSubmit={handlePostcodeSubmit}>
          <label htmlFor="hsm-postcode-input" className="hsm-postcode-label">Or enter your postcode</label>
          <input
            id="hsm-postcode-input"
            type="text"
            inputMode="text"
            autoComplete="postal-code"
            placeholder="e.g. SW4 0JU"
            value={postcode}
            onChange={e => { setPostcode(e.target.value); setPostcodeError(null); }}
            className="hsm-postcode-input"
          />
          <button type="submit" className="hsm-btn" disabled={postcodeBusy}>
            {postcodeBusy ? 'Finding…' : 'Go'}
          </button>
        </form>

        <span className="hsm-map-count">
          {dataReady ? `${activeCount.toLocaleString()} restaurant${activeCount !== 1 ? 's' : ''}` : 'Loading…'}
        </span>
      </div>

      {(locateError || postcodeError) && (
        <div className="hsm-locate-error" role="status">
          {locateError || postcodeError}
        </div>
      )}

      <div ref={mapContainer} className="hsm-map" />

      <style>{`
        .hsm { display: flex; flex-direction: column; gap: 12px; }
        .hsm-card {
          background: white;
          border-radius: 16px;
          padding: 20px 24px;
          box-shadow: 0 4px 24px rgba(45,80,22,0.10);
          border: 1px solid #e8e2d9;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .hsm-search-wrap { position: relative; }
        .hsm-search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 1.05rem;
          pointer-events: none;
          z-index: 1;
        }
        .hsm-search-input {
          width: 100%;
          padding: 13px 16px 13px 42px;
          border: 1.5px solid #e8e2d9;
          border-radius: 8px;
          font-size: 1rem;
          background: #FAF7F2;
          color: #1A1A1A;
          font-family: inherit;
        }
        .hsm-search-input:focus { outline: none; border-color: #2D5016; }
        .hsm-pill {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 11px 14px 11px 42px;
          border: 1.5px solid #2D5016;
          border-radius: 8px;
          background: #eef3e8;
          color: #1A1A1A;
          font-size: 0.95rem;
        }
        .hsm-pill button {
          background: transparent;
          border: none;
          color: #2D5016;
          font-size: 1rem;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        }
        .hsm-pill button:hover { background: rgba(45,80,22,0.1); }
        .hsm-suggestions {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #e8e2d9;
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(45,80,22,0.16);
          list-style: none;
          padding: 4px;
          z-index: 50;
          max-height: 320px;
          overflow-y: auto;
        }
        .hsm-suggestions li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 9px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9375rem;
          color: #1A1A1A;
        }
        .hsm-suggestions li.is-highlighted { background: #eef3e8; }
        .hsm-suggestion-count {
          font-size: 0.8125rem;
          color: #6b6457;
          background: #FAF7F2;
          padding: 2px 8px;
          border-radius: 12px;
        }
        .hsm-filter-checks {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .hsm-filter-check {
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
        .hsm-filter-check:hover { border-color: #2D5016; background: #eef3e8; }
        .hsm-filter-check input { accent-color: #2D5016; }
        .hsm-card-actions { display: flex; justify-content: flex-end; }
        .hsm-clear-btn {
          background: transparent;
          color: #C4622D;
          border: 1.5px solid #C4622D;
          padding: 7px 16px;
          border-radius: 6px;
          font-size: 0.875rem;
          font-family: inherit;
          cursor: pointer;
        }
        .hsm-clear-btn:hover { background: #fdf0e8; }
        .hsm-map-controls {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          padding: 4px 4px 0;
        }
        .hsm-btn {
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
        .hsm-btn--near-me { background: #2D5016; color: white; border-color: #2D5016; }
        .hsm-btn--near-me:hover { background: #3d6b1e; }
        .hsm-btn:disabled { opacity: 0.6; cursor: default; }
        .hsm-map-count { font-size: 0.875rem; color: #6b6457; }
        .hsm-postcode {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .hsm-postcode-label {
          font-size: 0.8125rem;
          color: #6b6457;
        }
        .hsm-postcode-input {
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
        .hsm-postcode-input:focus { outline: none; border-color: #2D5016; }
        .hsm-locate-error {
          padding: 8px 12px;
          background: #fdf0e8;
          border: 1px solid #C4622D;
          border-radius: 6px;
          color: #1A1A1A;
          font-size: 0.875rem;
        }
        .hsm-map {
          height: 520px;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #e8e2d9;
        }
        @media (max-width: 600px) {
          .hsm-map { height: 380px; }
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
