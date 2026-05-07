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

function Tag({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 10px', borderRadius: '999px',
      fontSize: '0.74rem', fontWeight: 500,
      background: '#2D5016', color: '#fff',
    }}>
      ✓ {label}
    </span>
  );
}

function Card({ r }: { r: Restaurant }) {
  const priceMap: Record<string, string> = { '£': '£', '££': '££', '$$$': '£££' };
  const tags = [
    r.kidsMenu === 'yes' && 'Kids menu',
    r.highchairs === 'yes' && 'Highchairs',
    r.outdoorSpace === 'yes' && 'Outdoor',
    r.buggyAccessible === 'yes' && 'Buggy friendly',
  ].filter(Boolean) as string[];

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
        <div style={{ position: 'relative', height: '180px', background: 'linear-gradient(135deg,#eef3e8,#dce8cc)', overflow: 'hidden' }}>
          {r.photos[0] ? (
            <img src={r.photos[0]} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'Georgia,serif', color: '#2D5016', fontSize: '0.95rem', textAlign: 'center', padding: '16px' }}>
                {r.cuisineType.split('/')[0].trim()}
              </span>
            </div>
          )}
          <span style={{
            position: 'absolute', top: '12px', left: '12px',
            background: '#C4622D', color: 'white',
            fontSize: '0.7rem', fontWeight: 600, padding: '3px 10px',
            borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.06em',
            display: 'inline-flex', alignItems: 'center', gap: '4px',
          }}>⭐ Featured</span>
          <span style={{
            position: 'absolute', bottom: '12px', right: '12px',
            background: 'rgba(255,255,255,0.92)', color: '#6b6457',
            fontSize: '0.8rem', fontWeight: 700, padding: '2px 9px', borderRadius: '20px'
          }}>{priceMap[r.priceRange]}</span>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#C4622D' }}>
            {r.area}
          </div>
          <h3 style={{ fontFamily: 'Georgia,serif', fontSize: '1.1rem', color: '#1A1A1A', lineHeight: 1.25, fontWeight: 700, margin: 0 }}>
            {r.name}
          </h3>
          <div style={{ fontSize: '0.8rem', color: '#6b6457' }}>
            {r.cuisineType} · <span style={{ color: '#D97706' }}>★</span> {r.googleRating}
          </div>
          <p style={{
            fontSize: '0.875rem', color: '#6b6457', lineHeight: 1.55, margin: 0,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{r.shortDescription}</p>

          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '2px' }}>
              {tags.map(t => <Tag key={t} label={t} />)}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #e8e2d9' }}>
            <span style={{ fontSize: '0.78rem', color: '#6b6457' }}>{r.reviewCount.toLocaleString()} reviews</span>
            <span style={{ fontSize: '0.875rem', color: '#C4622D', fontWeight: 600 }}>View details →</span>
          </div>
        </div>
      </article>
    </a>
  );
}

export default function FeaturedCarousel({ restaurants }: { restaurants: Restaurant[] }) {
  const visible = restaurants.slice(0, 8);
  return (
    <div>
      <div className="featured-grid">
        {visible.map(r => <Card key={r.slug} r={r} />)}
      </div>
      <style>{`
        .featured-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
        }
        @media (max-width: 1080px) { .featured-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 820px)  { .featured-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 540px)  { .featured-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
