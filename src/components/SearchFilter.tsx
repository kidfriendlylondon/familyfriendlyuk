import { useState, useMemo } from 'react';

interface Restaurant {
  id: string;
  slug: string;
  name: string;
  area: string;
  areaSlug: string;
  city: string;
  cuisineType: string;
  priceRange: string;
  googleRating: number;
  reviewCount: number;
  lat: number;
  lng: number;
  kidsMenu: string;
  highchairs: string;
  outdoorSpace: string;
  softPlay: string;
  babyChanging: string;
  buggyAccessible: string;
  noiseLevel: string;
  bestForAgeRange: string[];
  veganOptions: string;
  glutenFreeOptions: string;
  halalOptions: string;
  featured: boolean;
  shortDescription: string;
  photos: string[];
  tags: string[];
}

interface ActiveFilters {
  search: string;
  highchairs: boolean;
  kidsMenu: boolean;
  outdoorSpace: boolean;
  buggyFriendly: boolean;
  softPlay: boolean;
  cuisine: string;
  price: string;
  ageRange: string;
  vegan: boolean;
  glutenFree: boolean;
  halal: boolean;
}

const EMPTY: ActiveFilters = {
  search: '', highchairs: false, kidsMenu: false, outdoorSpace: false,
  buggyFriendly: false, softPlay: false, cuisine: '', price: '',
  ageRange: '', vegan: false, glutenFree: false, halal: false,
};

function applyFilters(list: Restaurant[], f: ActiveFilters): Restaurant[] {
  return list.filter(r => {
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.area.toLowerCase().includes(q) && !r.city.toLowerCase().includes(q) && !r.cuisineType.toLowerCase().includes(q)) return false;
    }
    if (f.highchairs && r.highchairs !== 'yes') return false;
    if (f.kidsMenu && r.kidsMenu !== 'yes') return false;
    if (f.outdoorSpace && r.outdoorSpace !== 'yes') return false;
    if (f.buggyFriendly && r.buggyAccessible !== 'yes') return false;
    if (f.softPlay && r.softPlay !== 'yes') return false;
    if (f.cuisine && !r.cuisineType.toLowerCase().includes(f.cuisine.toLowerCase())) return false;
    if (f.price && r.priceRange !== f.price) return false;
    if (f.ageRange && !r.bestForAgeRange.includes(f.ageRange) && !r.bestForAgeRange.includes('all ages')) return false;
    if (f.vegan && r.veganOptions !== 'yes') return false;
    if (f.glutenFree && r.glutenFreeOptions !== 'yes') return false;
    if (f.halal && r.halalOptions !== 'yes') return false;
    return true;
  });
}

function Badge({ icon, label }: { icon: string; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 9px', borderRadius: '20px',
      fontSize: '0.77rem', fontWeight: 500,
      background: '#eef3e8', color: '#2D5016',
    }}>
      <span>{icon}</span>{label}
    </span>
  );
}

function Card({ r }: { r: Restaurant }) {
  const priceLabel: Record<string, string> = { '£': '£', '££': '££', '$$$': '£££' };
  const stars = Math.round(r.googleRating);
  return (
    <a href={`/restaurants/${r.slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', height: '100%' }}>
      <article style={{
        background: 'white', borderRadius: '12px',
        boxShadow: '0 2px 12px rgba(45,80,22,0.08)',
        overflow: 'hidden', width: '100%', display: 'flex', flexDirection: 'column',
        transition: 'box-shadow 0.2s, transform 0.2s', border: r.featured ? '2px solid #C4622D' : 'none',
      }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = '0 8px 28px rgba(45,80,22,0.14)'; el.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = '0 2px 12px rgba(45,80,22,0.08)'; el.style.transform = ''; }}
      >
        <div style={{ position: 'relative', height: '188px', background: 'linear-gradient(135deg,#eef3e8,#dce8cc)', flexShrink: 0, overflow: 'hidden' }}>
          {r.photos[0]
            ? <img src={r.photos[0]} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'Georgia,serif', color: '#2D5016', fontSize: '0.95rem', textAlign: 'center', padding: '16px' }}>{r.cuisineType.split('/')[0].trim()}</span>
              </div>
          }
          {r.featured && (
            <span style={{ position: 'absolute', top: 10, left: 10, background: '#C4622D', color: 'white', fontSize: '0.7rem', fontWeight: 600, padding: '3px 9px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Featured</span>
          )}
          <span style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(255,255,255,0.92)', color: '#6b6457', fontSize: '0.8rem', fontWeight: 700, padding: '2px 9px', borderRadius: '20px' }}>{priceLabel[r.priceRange]}</span>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#C4622D', fontWeight: 500 }}>{r.cuisineType}</span>
            <span style={{ fontSize: '0.8rem', color: '#9a9086' }}>· {r.area}</span>
          </div>
          <h3 style={{ fontFamily: 'Georgia,serif', fontSize: '1.1rem', color: '#1A1A1A', lineHeight: 1.3, margin: 0 }}>{r.name}</h3>
          <p style={{ fontSize: '0.875rem', color: '#6b6457', lineHeight: 1.6, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.shortDescription}</p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '2px' }}>
            {r.kidsMenu === 'yes' && <Badge icon="🍽️" label="Kids menu" />}
            {r.highchairs === 'yes' && <Badge icon="🪑" label="Highchairs" />}
            {r.outdoorSpace === 'yes' && <Badge icon="🌿" label="Outdoor" />}
            {r.buggyAccessible === 'yes' && <Badge icon="🛻" label="Buggy friendly" />}
            {r.softPlay === 'yes' && <Badge icon="🎪" label="Soft play" />}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid #e8e2d9' }}>
            <span style={{ fontSize: '0.83rem', color: '#c9a227' }}>
              {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
              <span style={{ color: '#6b6457', marginLeft: '4px' }}>{r.googleRating} ({r.reviewCount.toLocaleString()})</span>
            </span>
            <span style={{ fontSize: '0.83rem', color: '#2D5016', fontWeight: 500 }}>View →</span>
          </div>
        </div>
      </article>
    </a>
  );
}

const PILL_FILTERS: { key: keyof ActiveFilters; label: string; icon: string }[] = [
  { key: 'highchairs', label: 'Highchairs', icon: '🪑' },
  { key: 'kidsMenu', label: 'Kids Menu', icon: '🍽️' },
  { key: 'outdoorSpace', label: 'Outdoor Space', icon: '🌿' },
  { key: 'buggyFriendly', label: 'Buggy Friendly', icon: '🛻' },
  { key: 'softPlay', label: 'Soft Play', icon: '🎪' },
];

export default function SearchFilter({ restaurants }: { restaurants: Restaurant[] }) {
  const [filters, setFilters] = useState<ActiveFilters>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [draft, setDraft] = useState<ActiveFilters>(EMPTY);

  const activeFilters = submitted ? filters : EMPTY;
  const results = useMemo(() => applyFilters(restaurants, activeFilters), [activeFilters, restaurants]);

  const activeCount = useMemo(() =>
    Object.entries(draft).filter(([k, v]) => k !== 'search' ? v !== '' && v !== false : (v as string).trim() !== '').length,
    [draft]
  );

  function toggle(key: keyof ActiveFilters) {
    setDraft(d => ({ ...d, [key]: !d[key] }));
  }
  function setDraftField(key: keyof ActiveFilters, value: string) {
    setDraft(d => ({ ...d, [key]: value }));
  }
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setFilters(draft);
    setSubmitted(true);
  }
  function clearAll() {
    setDraft(EMPTY);
    setFilters(EMPTY);
    setSubmitted(false);
  }

  const showResults = submitted;

  return (
    <div>
      <form onSubmit={handleSearch} style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 24px rgba(45,80,22,0.10)', border: '1px solid #e8e2d9' }}>

        {/* Text search */}
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem', pointerEvents: 'none' }}>🔍</span>
          <input
            type="text"
            value={draft.search}
            onChange={e => setDraftField('search', e.target.value)}
            placeholder="Search by restaurant name or town..."
            style={{
              width: '100%', padding: '13px 16px 13px 42px',
              border: '1.5px solid #e8e2d9', borderRadius: '8px',
              fontSize: '1rem', background: '#FAF7F2', color: '#1A1A1A',
              fontFamily: 'inherit',
            }}
            onFocus={e => e.target.style.borderColor = '#2D5016'}
            onBlur={e => e.target.style.borderColor = '#e8e2d9'}
          />
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8125rem', color: '#6b6457', fontWeight: 500, marginRight: '4px' }}>Must have:</span>
          {PILL_FILTERS.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '7px 14px', borderRadius: '20px', fontSize: '0.875rem', fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.15s', border: '1.5px solid',
                borderColor: draft[key] ? '#2D5016' : '#e8e2d9',
                background: draft[key] ? '#2D5016' : 'white',
                color: draft[key] ? 'white' : '#1A1A1A',
                fontFamily: 'inherit',
              }}
            >
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>

        {/* Dropdown filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#6b6457', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cuisine</label>
            <select
              value={draft.cuisine}
              onChange={e => setDraftField('cuisine', e.target.value)}
              style={{ padding: '9px 12px', border: '1.5px solid #e8e2d9', borderRadius: '6px', fontSize: '0.9375rem', background: 'white', color: draft.cuisine ? '#1A1A1A' : '#9a9086', fontFamily: 'inherit' }}
            >
              <option value="">All cuisines</option>
              <option value="Italian">Italian</option>
              <option value="Indian">Indian</option>
              <option value="British">British</option>
              <option value="Mediterranean">Mediterranean</option>
              <option value="French">French</option>
              <option value="Turkish">Turkish</option>
              <option value="American">American</option>
              <option value="Thai">Thai</option>
              <option value="Burgers">Burgers</option>
              <option value="Pizza">Pizza</option>
              <option value="Pub">Pub</option>
              <option value="Brunch">Brunch / Café</option>
              <option value="Vegan">Vegan / Plant-based</option>
              <option value="Caribbean">Caribbean</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#6b6457', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Price</label>
            <select
              value={draft.price}
              onChange={e => setDraftField('price', e.target.value)}
              style={{ padding: '9px 12px', border: '1.5px solid #e8e2d9', borderRadius: '6px', fontSize: '0.9375rem', background: 'white', color: draft.price ? '#1A1A1A' : '#9a9086', fontFamily: 'inherit' }}
            >
              <option value="">Any price</option>
              <option value="£">£ — Budget</option>
              <option value="££">££ — Mid-range</option>
              <option value="$$$">£££ — Special occasion</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#6b6457', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Age range</label>
            <select
              value={draft.ageRange}
              onChange={e => setDraftField('ageRange', e.target.value)}
              style={{ padding: '9px 12px', border: '1.5px solid #e8e2d9', borderRadius: '6px', fontSize: '0.9375rem', background: 'white', color: draft.ageRange ? '#1A1A1A' : '#9a9086', fontFamily: 'inherit' }}
            >
              <option value="">All ages</option>
              <option value="babies">Babies</option>
              <option value="toddlers">Toddlers</option>
              <option value="primary">Primary age</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#6b6457', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dietary</label>
            <select
              value={draft.vegan ? 'vegan' : draft.glutenFree ? 'gluten-free' : draft.halal ? 'halal' : ''}
              onChange={e => {
                const v = e.target.value;
                setDraft(d => ({ ...d, vegan: v === 'vegan', glutenFree: v === 'gluten-free', halal: v === 'halal' }));
              }}
              style={{ padding: '9px 12px', border: '1.5px solid #e8e2d9', borderRadius: '6px', fontSize: '0.9375rem', background: 'white', color: (draft.vegan || draft.glutenFree || draft.halal) ? '#1A1A1A' : '#9a9086', fontFamily: 'inherit' }}
            >
              <option value="">No preference</option>
              <option value="vegan">Vegan options</option>
              <option value="gluten-free">Gluten free options</option>
              <option value="halal">Halal</option>
            </select>
          </div>
        </div>

        {/* Submit row */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="submit"
            style={{
              background: '#C4622D', color: 'white', border: 'none',
              padding: '12px 28px', borderRadius: '6px', fontSize: '1rem', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#d4703a')}
            onMouseLeave={e => (e.currentTarget.style.background = '#C4622D')}
          >
            Find restaurants
            {activeCount > 0 && <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '20px', padding: '1px 8px', fontSize: '0.875rem' }}>{activeCount} filter{activeCount !== 1 ? 's' : ''}</span>}
          </button>

          {showResults && (
            <button
              type="button"
              onClick={clearAll}
              style={{
                background: 'transparent', color: '#6b6457', border: '1.5px solid #e8e2d9',
                padding: '11px 20px', borderRadius: '6px', fontSize: '0.9375rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Clear all
            </button>
          )}

          {showResults && (
            <span style={{ fontSize: '0.9rem', color: '#6b6457', marginLeft: '4px' }}>
              {results.length} restaurant{results.length !== 1 ? 's' : ''} found
            </span>
          )}
        </div>
      </form>

      {/* Results */}
      {showResults && (
        <div style={{ marginTop: '40px' }}>
          {results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 24px', color: '#6b6457' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🌿</div>
              <h3 style={{ fontFamily: 'Georgia,serif', fontSize: '1.35rem', color: '#1A1A1A', marginBottom: '10px' }}>No restaurants match those filters</h3>
              <p style={{ fontSize: '1rem', marginBottom: '20px' }}>Try removing a filter or two — or <a href="/suggest" style={{ color: '#2D5016', textDecoration: 'underline' }}>suggest a restaurant</a> that fits the bill.</p>
              <button
                onClick={clearAll}
                style={{ background: '#2D5016', color: 'white', border: 'none', padding: '11px 24px', borderRadius: '6px', fontSize: '0.9375rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <h2 style={{ fontFamily: 'Georgia,serif', fontSize: '1.5rem', color: '#1A1A1A', margin: 0 }}>
                  {results.length} restaurant{results.length !== 1 ? 's' : ''} found
                </h2>
                <button
                  onClick={clearAll}
                  style={{ background: 'transparent', color: '#6b6457', border: '1px solid #e8e2d9', padding: '7px 16px', borderRadius: '20px', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Clear filters
                </button>
              </div>
              <div className="search-results-grid">
                {results.map(r => <Card key={r.slug} r={r} />)}
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        .search-results-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        @media (max-width: 900px) { .search-results-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 560px) { .search-results-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
