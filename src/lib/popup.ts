// Build the HTML body for a Mapbox popup.
// Shared between the home and city maps so they stay visually consistent.

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildMarkerPopupHtml(p: Record<string, any>): string {
  const cuisine = escapeHtml(p.cuisineType ?? '');
  const name = escapeHtml(p.name ?? '');
  const area = escapeHtml(p.area ?? '');
  const price = escapeHtml(p.priceRange ?? '');
  const rating = p.googleRating != null ? Number(p.googleRating).toFixed(1) : '';
  const slug = encodeURIComponent(p.slug ?? '');

  const featureIcons: string[] = [];
  if (p.kidsMenu === 1 || p.kidsMenu === true) featureIcons.push('🍽️ Kids menu');
  if (p.highchairs === 1 || p.highchairs === true) featureIcons.push('🪑 Highchairs');
  if (p.outdoorSpace === 1 || p.outdoorSpace === true) featureIcons.push('🌿 Outdoor');
  const features = featureIcons.slice(0, 3);

  const thumb = p.thumbnail
    ? `<img src="${escapeHtml(p.thumbnail)}" alt="" loading="lazy" style="width:56px;height:56px;object-fit:cover;border-radius:6px;flex-shrink:0" />`
    : '';

  const featurePills = features.length
    ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">${features
        .map(f => `<span style="font-size:0.65rem;background:#eef3e8;color:#2D5016;padding:1px 6px;border-radius:10px;font-weight:500;white-space:nowrap">${escapeHtml(f)}</span>`)
        .join('')}</div>`
    : '';

  return `
    <div class="map-popup">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div style="font-size:0.68rem;color:#C4622D;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">${cuisine}</div>
          <h4 style="font-family:Georgia,serif;font-size:0.95rem;line-height:1.2;margin:0 0 4px;color:#1A1A1A">${name}</h4>
          <p style="font-size:0.72rem;color:#6b6457;margin:0">${area}${rating ? ` · ⭐ ${rating}` : ''}${price ? ` · ${price}` : ''}</p>
        </div>
        ${thumb}
      </div>
      ${featurePills}
      <a href="/restaurants/${slug}" style="display:inline-block;margin-top:10px;font-size:0.78rem;font-weight:600;color:#2D5016">View listing →</a>
    </div>
  `;
}
