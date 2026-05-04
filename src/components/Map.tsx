import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Restaurant {
  id: string;
  slug: string;
  name: string;
  area: string;
  city: string;
  cuisineType: string;
  priceRange: string;
  googleRating: number;
  lat: number;
  lng: number;
  kidsMenu: string;
  highchairs: string;
  buggyAccessible: string;
  softPlay: string;
  outdoorSpace: string;
  babyChanging: string;
  veganOptions: string;
  glutenFreeOptions: string;
  halalOptions: string;
  featured: boolean;
  shortDescription: string;
}

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

function matchesFilters(r: Restaurant, f: Filters): boolean {
  if (f.kidsMenu && r.kidsMenu !== 'yes') return false;
  if (f.highchairs && r.highchairs !== 'yes') return false;
  if (f.buggyFriendly && r.buggyAccessible !== 'yes') return false;
  if (f.softPlay && r.softPlay !== 'yes') return false;
  if (f.outdoorSpace && r.outdoorSpace !== 'yes') return false;
  if (f.babyChanging && r.babyChanging !== 'yes') return false;
  if (f.vegan && r.veganOptions !== 'yes') return false;
  if (f.glutenFree && r.glutenFreeOptions !== 'yes') return false;
  if (f.halal && r.halalOptions !== 'yes') return false;
  return true;
}

export default function Map({ restaurants }: { restaurants: Restaurant[] }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [activeCount, setActiveCount] = useState(restaurants.length);
  const [locating, setLocating] = useState(false);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const filtered = restaurants.filter(r => matchesFilters(r, filters));

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
  }, []);

  const addMarkers = useCallback((list: Restaurant[]) => {
    if (!mapRef.current) return;
    clearMarkers();
    list.forEach(r => {
      const el = document.createElement('div');
      el.className = r.featured ? 'map-marker map-marker--featured' : 'map-marker';
      el.setAttribute('aria-label', r.name);

      const popup = new mapboxgl.Popup({ offset: 25, maxWidth: '260px', closeButton: true })
        .setHTML(`
          <div class="map-popup">
            <div style="font-size:0.75rem;color:#C4622D;font-weight:500;margin-bottom:4px">${r.cuisineType}</div>
            <h4 style="font-family:Georgia,serif;font-size:1rem;margin-bottom:6px;color:#1A1A1A">${r.name}</h4>
            <p style="font-size:0.8125rem;color:#6b6457;margin-bottom:4px">${r.area} · ${r.priceRange}</p>
            <p style="font-size:0.8125rem;color:#6b6457;margin-bottom:10px">⭐ ${r.googleRating}</p>
            <a href="/restaurants/${r.slug}" style="font-size:0.875rem;font-weight:500;color:#2D5016">View listing →</a>
          </div>
        `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([r.lng, r.lat])
        .setPopup(popup)
        .addTo(mapRef.current!);

      el.addEventListener('click', () => {
        if (popupRef.current && popupRef.current !== popup) popupRef.current.remove();
        popupRef.current = popup;
      });

      markersRef.current.push(marker);
    });
  }, [clearMarkers]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    if (!TOKEN) return;

    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-0.127, 51.507],
      zoom: 10,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      addMarkers(restaurants);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current?.loaded()) return;
    addMarkers(filtered);
    setActiveCount(filtered.length);
  }, [filters]);

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

  const isPlaceholder = !TOKEN || TOKEN.startsWith('pk.placeholder');

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
      {/* Controls bar */}
      <div className="map-controls">
        <button
          className={`map-btn map-btn--near-me ${locating ? 'loading' : ''}`}
          onClick={handleNearMe}
          disabled={locating}
        >
          {locating ? '⌛ Finding you…' : '📍 Near me'}
        </button>

        <span className="map-count">
          {activeCount} restaurant{activeCount !== 1 ? 's' : ''}
        </span>

        {activeFilterCount > 0 && (
          <button className="map-btn map-btn--clear" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {/* Filter panel (always visible) */}
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

      {/* Map */}
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
        .map-marker {
          width: 32px;
          height: 32px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          background: #2D5016;
          border: 2px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          cursor: pointer;
          transition: transform 0.15s;
        }
        .map-marker:hover { transform: rotate(-45deg) scale(1.2); }
        .map-marker--featured {
          background: #C4622D;
          width: 38px;
          height: 38px;
        }
      `}</style>
    </div>
  );
}
