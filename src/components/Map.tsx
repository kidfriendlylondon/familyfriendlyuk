import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

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
  kidsMenu: false,
  highchairs: false,
  buggyFriendly: false,
  softPlay: false,
  outdoorSpace: false,
  babyChanging: false,
  vegan: false,
  glutenFree: false,
  halal: false,
};

const TOKEN = import.meta.env.PUBLIC_MAPBOX_TOKEN || '';
const SOURCE_ID = 'restaurants';
const DATA_URL = '/restaurants.geojson';

// Filter key → property key in the GeoJSON feature.properties (which uses 0/1 ints)
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

type FeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id?: number;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: Record<string, any>;
  }>;
};

function applyFilters(fc: FeatureCollection, filters: Filters): FeatureCollection {
  const active = (Object.keys(filters) as (keyof Filters)[]).filter(k => filters[k]);
  if (active.length === 0) return fc;
  return {
    type: 'FeatureCollection',
    features: fc.features.filter(f => active.every(k => f.properties[FILTER_PROP_MAP[k]] === 1)),
  };
}

export default function Map({ totalCount }: { totalCount: number }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const dataRef = useRef<FeatureCollection | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [activeCount, setActiveCount] = useState(totalCount);
  const [locating, setLocating] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    if (!TOKEN) return;

    mapboxgl.accessToken = TOKEN;

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
        dataRef.current = fc;

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
              '#9bbb6e', 25,
              '#5d8e3e', 100,
              '#2D5016',
            ],
            'circle-radius': [
              'step', ['get', 'point_count'],
              18, 25, 24, 100, 32,
            ],
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

        // Click cluster → zoom in
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

        // Click point → popup
        map.on('click', 'unclustered-point', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const coords = (f.geometry as any).coordinates.slice() as [number, number];
          const p = f.properties as any;
          if (popupRef.current) popupRef.current.remove();
          popupRef.current = new mapboxgl.Popup({ offset: 12, maxWidth: '260px' })
            .setLngLat(coords)
            .setHTML(`
              <div class="map-popup">
                <div style="font-size:0.75rem;color:#C4622D;font-weight:500;margin-bottom:4px">${escapeHtml(p.cuisineType ?? '')}</div>
                <h4 style="font-family:Georgia,serif;font-size:1rem;margin-bottom:6px;color:#1A1A1A">${escapeHtml(p.name ?? '')}</h4>
                <p style="font-size:0.8125rem;color:#6b6457;margin-bottom:4px">${escapeHtml(p.area ?? '')} · ${escapeHtml(p.priceRange ?? '')}</p>
                <p style="font-size:0.8125rem;color:#6b6457;margin-bottom:10px">⭐ ${p.googleRating ?? ''}</p>
                <a href="/restaurants/${encodeURIComponent(p.slug)}" style="font-size:0.875rem;font-weight:500;color:#2D5016">View listing →</a>
              </div>
            `)
            .addTo(map);
        });

        // Cursor hints
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

  // Apply filters to the source data
  useEffect(() => {
    if (!mapRef.current?.loaded() || !dataRef.current) return;
    const source = mapRef.current.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const filtered = applyFilters(dataRef.current, filters);
    source.setData(filtered);
    setActiveCount(filtered.features.length);
  }, [filters, dataReady]);

  const handleNearMe = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 13, essential: true });
        setLocating(false);
      },
      () => { setLocating(false); alert('Could not get your location. Please allow location access.'); },
      { timeout: 10000 }
    );
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
    <div className="map-wrapper">
      <div className="map-controls">
        <button
          className={`map-btn map-btn--near-me ${locating ? 'loading' : ''}`}
          onClick={handleNearMe}
          disabled={locating}
        >
          {locating ? '⌛ Finding you…' : '📍 Near me'}
        </button>

        <span className="map-count">
          {dataReady ? `${activeCount.toLocaleString()} restaurant${activeCount !== 1 ? 's' : ''}` : 'Loading…'}
        </span>

        {activeFilterCount > 0 && (
          <button className="map-btn map-btn--clear" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      <div className="filter-panel">
        <div className="filter-checks">
          {([
            ['kidsMenu', 'Kids menu'],
            ['highchairs', 'Highchairs'],
            ['buggyFriendly', 'Buggy friendly'],
            ['softPlay', 'Soft play'],
            ['outdoorSpace', 'Outdoor space'],
            ['babyChanging', 'Baby changing'],
            ['vegan', 'Vegan'],
            ['glutenFree', 'Gluten free'],
            ['halal', 'Halal'],
          ] as const).map(([key, label]) => (
            <label key={key} className="filter-check">
              <input
                type="checkbox"
                checked={filters[key]}
                onChange={e => updateFilter(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div ref={mapContainer} className="map-container" />

      <style>{`
        .map-wrapper { position: relative; }
        .map-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 0;
          flex-wrap: wrap;
        }
        .map-btn {
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
        }
        .map-btn:hover, .map-btn.active { border-color: #2D5016; color: #2D5016; background: #eef3e8; }
        .map-btn--near-me { background: #2D5016; color: white; border-color: #2D5016; }
        .map-btn--near-me:hover { background: #3d6b1e; }
        .map-btn--clear { color: #C4622D; border-color: #C4622D; }
        .map-btn--clear:hover { background: #fdf0e8; }
        .map-btn:disabled { opacity: 0.6; cursor: default; }
        .map-count { font-size: 0.875rem; color: #6b6457; margin-left: 4px; }
        .filter-panel {
          background: white;
          border: 1.5px solid #e8e2d9;
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 12px;
          box-shadow: 0 4px 16px rgba(45,80,22,0.1);
        }
        .filter-checks {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .filter-check {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.875rem;
          color: #1A1A1A;
          padding: 6px 12px;
          border: 1.5px solid #e8e2d9;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.15s;
          user-select: none;
        }
        .filter-check:hover { border-color: #2D5016; background: #eef3e8; }
        .filter-check input { accent-color: #2D5016; }
        .map-container {
          height: 520px;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #e8e2d9;
        }
        @media (max-width: 600px) {
          .map-container { height: 380px; }
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
