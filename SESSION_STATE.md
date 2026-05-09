# Session State

Living handover for the in-flight workstream. Update or delete when the
work below has shipped.

## What we're working on

Enriching the FFU dataset with **review-derived signals** for the
featured-restaurant algorithm. The four target signals are
`kidsEatFree`, `toysAvailable`, `playAreaOnSite`, and `parkNearby`.

A description-text miner already ran (`scripts/detect-featured-signals.py`)
but only fired on **7 of 35,527 entries** — FFU descriptions are
AI-templated, so the real signal lives in customer review text. Plan is
to pull reviews from Outscraper, mine them, and re-run the (deferred)
4-tier featured-restaurant selector with the new inputs.

## What's done

- `scripts/detect-featured-signals.py` — description-text miner.
  Committed `ce3d0df`. Baseline counts:
  `kidsEatFree=3, toysAvailable=1, playAreaOnSite=0, parkNearby=3`.
- `scripts/extract-review-signals.py` — review-text miner, ready to
  run. Committed `814f1a9`. Reads an Outscraper Reviews XLSX, scans
  review text per place, applies sentence-level negation guard
  ("wish", "should be", "no longer", "doesn't have", etc.) so
  reviewers complaining about an absent feature don't flip the flag
  on. Stores both the boolean flag and a `<flag>Snippet` excerpt back
  into `src/data/restaurants.ts`. Idempotent: re-runs replace any
  existing flags/snippet lines. Joins to existing entries by
  `(name, postcode)`. Tolerates either Outscraper review shape —
  long-form (one row per review) or wide-form (one row per place with
  `reviews_data` JSON).
- Place-id CSVs generated for the Outscraper job:
  - `/Users/natalieellis/Downloads/ffuk-place-ids.csv` — 46,853 IDs
    (all places Outscraper returned across the original 556 city-by-
    city queries)
  - `/Users/natalieellis/Downloads/ffuk-place-ids-current.csv` —
    **34,913 IDs** (only places that passed our quality filter and
    ship in the live DB) ← **the one to use** for the reviews pull
- Outscraper pull spec written and given to the user. Not yet
  triggered — user is going to run the job.

## What's pending

1. **User triggers the Outscraper Reviews job** with the spec below
   and lands the XLSX in `~/Downloads/`.
2. Claude runs `python3 scripts/extract-review-signals.py
   ~/Downloads/<filename>.xlsx` to mine the reviews and patch
   `src/data/restaurants.ts`.
3. Claude implements the deferred **4-tier featured-restaurant
   algorithm**. Spec is already in conversation history (search:
   "Rebuild the featured restaurant selection algorithm using a 4-
   tier system"). Hard filters: 100+ reviews, 4.6+ rating, passes
   quality bar, not fine-dining / cocktail-bar. Tiers A→D ordered
   by signal strength; sort within tier by `rating × log10(reviews)`.
   Output `featuredReason` field per restaurant.
4. Wire the algorithm into the homepage carousel (8 slots) and a new
   per-area featured strip (3 slots) on `/area/[city]`.
5. Build, commit, push, verify deploy.

## Outscraper pull spec (immediate next step for the user)

- **Service:** Google Maps Reviews V3 (NOT Google Maps Search — we
  already have the place data).
- **Input:** paste the contents of
  `/Users/natalieellis/Downloads/ffuk-place-ids-current.csv` as the
  query list (34,913 place_ids, one per line, drop the header).
- **Parameters:**
  ```jsonc
  {
    "reviewsLimit": 10,        // 10 most-recent reviews per place
    "sort":         "newest",  // bias toward currently-true signals
    "language":     "en",
    "ignoreEmpty":  true,
    "async":        true       // batch mode (job is >5,000)
  }
  ```
- **Cost estimate:** roughly £140–280 for 34,913 × 10 = ~349k reviews
  at Outscraper's bulk rate (~£0.40–0.80 / 1k reviews; verify in their
  pricing calculator).
- **Cheaper sanity-check option:** sample 5,000 places at
  `reviewsLimit: 5` first → ~25k reviews at ~£15. Use it to confirm
  the export shape before committing to the full pull.
- **Output handling:** save XLSX to `~/Downloads/`. The extractor
  accepts the path as a CLI arg.

## Open decisions

- **Outscraper budget.** £140–280 estimate is rough. User should
  confirm in their Outscraper dashboard's pricing calculator before
  launching. Cheaper sanity-check sample available.
- **`reviewsLimit` value.** Currently spec'd at 10. Higher → more
  recall, more cost. Probably 10 is fine — most signals (especially
  kidsEatFree) repeat across reviewers when present.
- **What to do with the 614 unmapped entries** (KFL hand-curated
  seeds whose postcodes don't match Outscraper rows). Recommendation:
  skip them — their descriptions already hold rich signal so review-
  mining adds little. Confirm before running.
- **Per-area featured slot UI placement.** Spec says 3 slots per
  area, A→B→C→D priority. Open question: render as a strip above the
  cards grid, a small separate "Local favourites" section, or
  decorate existing cards with a "Featured" badge. Default plan: a
  small "Featured here" strip above the cards grid, mirroring the
  homepage carousel styling.

## Immediate next step

User: trigger the Outscraper Reviews job per spec. When the XLSX
lands in `~/Downloads/`, paste this prompt into a fresh session:

> The Outscraper reviews XLSX is at `~/Downloads/<filename>.xlsx`.
> Run `scripts/extract-review-signals.py` against it, then implement
> the deferred 4-tier featured-restaurant algorithm and report the
> new Tier A/B/C/D counts vs the current baseline. Show 5 example
> featured restaurants per tier with their `featuredReason`.

## Useful context

- **Current restaurant count:** 35,527.
- **Site architecture:** Vercel hybrid SSR. Homepage + ~1,000
  `/area/{city}` pages static. `/restaurants/{slug}` SSR with 1-hour
  edge ISR cache. `/sitemap-index.xml` (auto) + `/sitemap-restaurants.xml`
  (custom) + `/robots.txt` references both.
- **Live quality filter on city pages:** hide listing if **all three**
  of `kidsMenu` / `highchairs` / `buggyAccessible` are non-`yes`
  (each is `no` or `likely`). Filter is mirrored inside `CityMap.tsx`
  so cards and pins always agree.
- **Recent commit chain:** `814f1a9` (review-text extractor) ←
  `ce3d0df` (description-text detection signals + 10-restaurant import
  refresh) ← `379c9f0` (city filter sync) ← `e63b793` (Near-me blue
  dot).
- **Files the next session will touch:** `src/data/restaurants.ts`
  (signal patches via the extractor), `src/pages/index.astro` (wire
  new featured selector to carousel), `src/pages/area/[city].astro`
  (new per-area featured strip), and likely `src/data/restaurants.ts`
  again to add the `getFeaturedRestaurantsForArea(slug, n)` helper
  alongside the rewritten `getFeaturedRestaurants(n)`.
