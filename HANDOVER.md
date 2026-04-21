# Family Friendly UK — Build Handover

## What was built

A complete Astro static site for **familyfriendlyuk.co.uk** — a UK-wide directory of family-friendly restaurants, searchable on an interactive map.

### Pages built (63 total)
- `/` — Homepage with interactive Mapbox map, real-time filters, featured carousel, areas grid
- `/regions` — Index of all covered areas with coming-soon cities
- `/area/clapham`, `/area/notting-hill`, `/area/islington`, `/area/richmond`, `/area/shoreditch` — Dynamic area pages (auto-generate from data as new restaurants are added)
- `/restaurants/[slug]` — 53 individual listing pages, one per restaurant
- `/suggest` — Suggest a restaurant form (Formspree)
- `/get-featured` — Featured listing pitch page with £29/month pricing
- `/sitemap.xml` — Full XML sitemap covering all 63 pages
- `/404` — Custom 404 page

### Data
All 53 restaurants from `~/kidfriendlylondon/src/data/restaurants.ts`, transformed and enriched with `city`/`area` fields. Stored in `/src/data/restaurants.ts`.

---

## Manual steps needed before going live

### 1. Push to GitHub (do this first)
```bash
cd /Users/natalieellis/familyfriendlyuk
gh repo create familyfriendlyuk --public --push
# or
git remote add origin https://github.com/YOUR_USERNAME/familyfriendlyuk.git
git push -u origin main
```

### 2. Deploy to Vercel
1. Go to [vercel.com](https://vercel.com) → New Project
2. Import the `familyfriendlyuk` GitHub repo
3. Framework preset: **Astro** (auto-detected)
4. Add these **Environment Variables** in Vercel dashboard:
   - `PUBLIC_MAPBOX_TOKEN` = your Mapbox public token (get from [account.mapbox.com](https://account.mapbox.com/access-tokens/))
   - `PUBLIC_FORMSPREE_ID` = your Formspree form ID (optional — forms already use hardcoded ID)
5. Deploy

### 3. Get a Mapbox token (REQUIRED for map to work)
1. Sign up free at [mapbox.com](https://mapbox.com)
2. Go to Account → Access Tokens → Create a token
3. Set scope: Public token (default scopes are fine)
4. Add to Vercel as `PUBLIC_MAPBOX_TOKEN`
5. The free tier includes 50,000 map loads/month — enough for a new site

### 4. Set up Formspree (for contact forms)
1. Sign up free at [formspree.io](https://formspree.io)
2. Create a new form
3. The forms currently use `https://formspree.io/f/xeojgvdl` — replace this with your own form ID in:
   - `src/components/EmailCapture.astro`
   - `src/pages/suggest.astro`
   - `src/pages/get-featured.astro`

### 5. Namecheap DNS records for familyfriendlyuk.co.uk
Once Vercel has assigned your deployment URL (e.g., `familyfriendlyuk.vercel.app`), add these in Namecheap:

**For the apex domain (familyfriendlyuk.co.uk):**
| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | @ | 76.76.21.21 | Automatic |
| A | @ | 76.76.21.22 | Automatic |

**For www:**
| Type | Host | Value | TTL |
|------|------|-------|-----|
| CNAME | www | cname.vercel-dns.com | Automatic |

Then in Vercel: Settings → Domains → Add `familyfriendlyuk.co.uk` and `www.familyfriendlyuk.co.uk`. Vercel auto-provisions SSL.

DNS propagation takes 10 minutes to 48 hours (usually under 1 hour for .co.uk).

---

## Design system

### Colours
- Background: `#FAF7F2` (warm cream)
- Primary: `#2D5016` (deep forest green)
- Accent: `#C4622D` (soft terracotta)
- Text: `#1A1A1A`
- Cards: `#FFFFFF` with warm shadow

### Typography
- Headlines: Georgia (serif) — loaded from system fonts, no external dependency
- Body: Inter (loaded from Google Fonts)

### Design tokens
All in `src/styles/global.css` as CSS custom properties under `:root`.

---

## Architecture

```
src/
├── data/
│   └── restaurants.ts          ← All restaurant data + helper functions
├── styles/
│   └── global.css              ← Design tokens + global styles
├── layouts/
│   └── BaseLayout.astro        ← HTML shell, header, footer
├── components/
│   ├── Map.tsx                 ← React island: Mapbox map + filters
│   ├── FeaturedCarousel.tsx    ← React island: featured restaurants carousel
│   ├── RestaurantCard.astro    ← Restaurant card component
│   ├── AttributeBadges.astro   ← Family-friendly badges
│   ├── EmailCapture.astro      ← Email signup form
│   ├── Header.astro
│   ├── Footer.astro
│   └── SEO.astro               ← Meta tags + JSON-LD schema
└── pages/
    ├── index.astro             ← Homepage
    ├── regions.astro           ← /regions
    ├── suggest.astro           ← /suggest
    ├── get-featured.astro      ← /get-featured
    ├── 404.astro
    ├── sitemap.xml.ts          ← Custom sitemap
    ├── area/
    │   └── [city].astro        ← /area/[city-slug] — dynamic, from data
    └── restaurants/
        └── [slug].astro        ← /restaurants/[slug] — individual listings
```

---

## Adding new restaurants

Edit `src/data/restaurants.ts` — add a new entry to the `restaurants` array with all required fields. On next build/deploy, the restaurant's listing page and its area page are automatically created.

Required fields:
- `id` (unique string), `slug` (URL-safe)
- `area`, `areaSlug`, `city`, `citySlug`
- `lat`, `lng` (for map — geocode the address if needed)
- All family attribute fields

When adding restaurants in a new city (e.g., Manchester), set `citySlug: 'manchester'` and a new area page at `/area/manchester` is generated automatically.

---

## SEO

Every page has:
- Unique `<title>` and `<meta description>`
- Canonical URL
- Open Graph tags
- JSON-LD structured data:
  - Homepage: WebSite schema
  - Listing pages: Restaurant schema + BreadcrumbList
  - Area pages: BreadcrumbList

Target keywords are baked into page copy and titles:
- Homepage: "family friendly restaurants UK", "kid friendly restaurants near me"
- Area pages: "family friendly restaurants [area]"
- Listing pages: "[restaurant name] [area] family friendly"

---

## Monetisation

All hooks are in place:

1. **Featured listings (£29/month)** — `/get-featured` page with contact form. Mark a restaurant as `featured: true` in the data to activate the orange pin and featured badge.

2. **AdSense** — Placeholder `<div class="ad-placeholder">` on every listing sidebar. Replace with AdSense code once approved. Also add ad units between listings on area pages.

3. **OpenTable affiliate links** — Set `openTableId` on any restaurant that uses OpenTable. The "Book a table" button auto-generates the affiliate URL.

4. **Email list** — EmailCapture component appears on homepage, all area pages, and all listing pages. Connect to Mailchimp/ConvertKit by replacing the Formspree action URL.

---

## Recommended next 30 days

**Week 1**
- [ ] Get Mapbox token → add to Vercel env vars
- [ ] Point Namecheap DNS to Vercel
- [ ] Sign up for Formspree, replace form IDs
- [ ] Verify site live at familyfriendlyuk.co.uk

**Week 2**
- [ ] Submit sitemap to Google Search Console: `https://familyfriendlyuk.co.uk/sitemap.xml`
- [ ] Apply for Google AdSense
- [ ] Set up email list (Mailchimp free tier, 500 contacts)
- [ ] Add real photos: swap `/images/restaurants/[slug]-1.jpg` etc. with actual photos

**Week 3–4**
- [ ] Add 20+ restaurants in Manchester to expand beyond London
- [ ] Reach out to featured restaurants from the existing list — offer the £29/month deal
- [ ] Launch on Mumsnet Local forums for each area
- [ ] Post in relevant Facebook groups (South London Mums, Islington Parents etc.)

**Ongoing**
- Add new cities as separate `citySlug` values — each gets its own area pages automatically
- Every new restaurant added gets its own listing page on next deploy (static, instant)

---

## Definition of Done — status

| Item | Status |
|------|--------|
| Deploys to Vercel successfully | ✅ Build passes (63 pages) |
| Interactive Mapbox map | ✅ Built (needs token in env vars) |
| Filters work in real time | ✅ |
| Geolocation "near me" | ✅ |
| All 53 restaurants as map pins + listing pages | ✅ |
| Warm editorial design | ✅ Cream/green/terracotta, Georgia headlines |
| Dynamic area pages from data | ✅ |
| /regions index page | ✅ |
| Suggest a place form | ✅ |
| Get Featured page | ✅ |
| Email capture throughout | ✅ |
| DNS records documented | ✅ (see above) |
| Handover note | ✅ This document |
