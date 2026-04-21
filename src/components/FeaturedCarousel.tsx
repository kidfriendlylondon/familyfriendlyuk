import { useState } from 'react';

interface Restaurant {
  slug: string;
  name: string;
  area: string;
  cuisineType: string;
  priceRange: string;
  googleRating: number;
  reviewCount: number;
  shortDescription: string;
  photos: string[];
  featured: boolean;
  kidsMenu: string;
  highchairs: string;
  outdoorSpace: string;
  buggyAccessible: string;
  bestForAgeRange: string[];
}

function Badge({ label, icon }: { label: string; icon: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 9px', borderRadius: '20px',
      fontSize: '0.78rem', fontWeight: '500',
      background: '#eef3e8', color: '#2D5016'
    }}>
      <span>{icon}</span>{label}
    </span>
  );
}

function Card({ r }: { r: Restaurant }) {
  const priceMap: Record<string, string> = { '£': '£', '££': '££', '$$$': '£££' };
  return (
    <a href={`/restaurants/${r.slug}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}>
      <article style={{
        background: 'white', borderRadius: '12px',
        boxShadow: '0 2px 12px rgba(45,80,22,0.08)',
        overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column',
        transition: 'box-shadow 0.2s, transform 0.2s',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(45,80,22,0.14)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(45,80,22,0.08)';
          (e.currentTarget as HTMLElement).style.transform = '';
        }}
      >
        <div style={{ position: 'relative', height: '200px', background: 'linear-gradient(135deg,#eef3e8,#dce8cc)', overflow: 'hidden' }}>
          {r.photos[0] ? (
            <img src={r.photos[0]} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'Georgia,serif', color: '#2D5016', fontSize: '1rem', textAlign: 'center', padding: '20px' }}>
                {r.cuisineType.split('/')[0].trim()}
              </span>
            </div>
          )}
          {r.featured && (
            <span style={{
              position: 'absolute', top: '12px', left: '12px',
              background: '#C4622D', color: 'white',
              fontSize: '0.7rem', fontWeight: '600', padding: '3px 9px',
              borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>Featured</span>
          )}
          <span style={{
            position: 'absolute', bottom: '12px', right: '12px',
            background: 'rgba(255,255,255,0.92)', color: '#6b6457',
            fontSize: '0.8rem', fontWeight: '700', padding: '2px 9px', borderRadius: '20px'
          }}>{priceMap[r.priceRange]}</span>
        </div>
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '8px', flex: '1' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: '#C4622D', fontWeight: 500 }}>{r.cuisineType}</span>
            <span style={{ fontSize: '0.8rem', color: '#6b6457' }}>· {r.area}</span>
          </div>
          <h3 style={{ fontFamily: 'Georgia,serif', fontSize: '1.1rem', color: '#1A1A1A', lineHeight: 1.3 }}>{r.name}</h3>
          <p style={{ fontSize: '0.875rem', color: '#6b6457', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {r.shortDescription}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '4px' }}>
            {r.kidsMenu === 'yes' && <Badge icon="🍽️" label="Kids menu" />}
            {r.highchairs === 'yes' && <Badge icon="🪑" label="Highchairs" />}
            {r.outdoorSpace === 'yes' && <Badge icon="🌿" label="Outdoor" />}
            {r.buggyAccessible === 'yes' && <Badge icon="🛻" label="Buggy friendly" />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #e8e2d9' }}>
            <span style={{ fontSize: '0.85rem', color: '#c9a227' }}>
              {'★'.repeat(Math.round(r.googleRating))}
              <span style={{ color: '#6b6457', marginLeft: '4px' }}>{r.googleRating} ({r.reviewCount.toLocaleString()})</span>
            </span>
            <span style={{ fontSize: '0.85rem', color: '#2D5016', fontWeight: 500 }}>View →</span>
          </div>
        </div>
      </article>
    </a>
  );
}

export default function FeaturedCarousel({ restaurants }: { restaurants: Restaurant[] }) {
  const [page, setPage] = useState(0);
  const perPage = 3;
  const pages = Math.ceil(restaurants.length / perPage);
  const visible = restaurants.slice(page * perPage, (page + 1) * perPage);

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '24px',
      }}
        className="carousel-grid"
      >
        {visible.map(r => <Card key={r.slug} r={r} />)}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '28px' }}>
          {Array.from({ length: pages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              style={{
                width: '10px', height: '10px', borderRadius: '50%', border: 'none',
                background: i === page ? '#2D5016' : '#e8e2d9',
                cursor: 'pointer', padding: 0, transition: 'background 0.2s',
              }}
              aria-label={`Page ${i + 1}`}
            />
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 900px) { .carousel-grid { grid-template-columns: repeat(2,1fr) !important; } }
        @media (max-width: 560px) { .carousel-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}
