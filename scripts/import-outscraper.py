#!/usr/bin/env python3
"""\
Import qualifying UK restaurants from Outscraper XLSX exports into
src/data/restaurants.ts. Inserts new entries before the closing `];`
of the restaurants array (preserves the helper functions below).

Qualifying criteria:
  - country_code == 'GB'
  - business_status == 'OPERATIONAL'
  - rating >= 3.8
  - type matches one of: restaurant / cafe / pub / gastropub / coffee shop /
    bakery / pizza / takeaway / sandwich shop / fish & chips / kebab /
    bar & grill / bistro / brasserie / diner / tea house / tea room / etc.
  - has lat/lng

Dedup: skip if (name lowercased, postcode no-space uppercase) already in TS file
or already added by an earlier file in this run.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Optional, Set, Tuple, List, Dict

import openpyxl

REPO = Path(__file__).resolve().parent.parent
DATA_PATH = REPO / 'src/data/restaurants.ts'

INPUT_FILES = [
    Path('/Users/natalieellis/Downloads/Outscraper-20260504203246s27.xlsx'),
    Path('/Users/natalieellis/Downloads/Outscraper-20260504204608s71.xlsx'),
]

# Substring tests against `type` (case-insensitive). If any matches, the venue qualifies.
QUALIFYING_TYPE_SUBSTRINGS = [
    'restaurant', 'cafe', 'café', 'coffee shop', 'pub', 'gastropub', 'bistro',
    'brasserie', 'bakery', 'pizza', 'burger', 'sandwich', 'fish and chips',
    'fish & chips', 'fish and chip', 'ice cream', 'tea house', 'tea room',
    'takeaway', 'kebab', 'diner', 'bar & grill', 'bar and grill', 'eatery',
    'food court', 'food hall', 'gelato', 'creperie', 'crêperie', 'noodle',
    'sushi', 'tapas', 'steakhouse', 'steak house', 'roastery', 'patisserie',
    'pâtisserie', 'pie shop', 'chippy', 'fish bar', 'grill house',
]

# If the venue's type matches one of these (case-insensitive substring),
# REJECT regardless of the qualifying list — guards against e.g. "Cocktail bar"
# matching "bar" in unrelated types we haven't anticipated.
EXCLUSION_TYPE_SUBSTRINGS = [
    'hotel', 'bed & breakfast', 'b&b', 'museum', 'attraction',
    'amusement', 'nightclub', 'event venue', 'caterer', 'catering',
    'food manufacturer', 'wholesale', 'distributor', 'butcher', 'fishmonger',
    'grocery', 'supermarket', 'convenience store', 'newsagent', 'florist',
    'church', 'school', 'university', 'college', 'gym', 'spa', 'salon',
    'barber', 'wedding venue',
]


def slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[''']", '', s)
    s = re.sub(r'&', 'and', s)
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')


def normalise_postcode(pc: str) -> str:
    return (pc or '').upper().replace(' ', '').strip()


def normalise_name(n: str) -> str:
    return (n or '').lower().strip()


def parse_existing_keys(ts_path: Path) -> Set[Tuple[str, str]]:
    text = ts_path.read_text()
    blocks = re.findall(r'\{\s*(.*?)\s*\},', text, re.DOTALL)
    keys: Set[Tuple[str, str]] = set()
    for b in blocks:
        nm = re.search(r'name:\s*"([^"]*)"', b)
        pc = re.search(r'postcode:\s*"([^"]*)"', b)
        if nm and pc:
            keys.add((normalise_name(nm.group(1)), normalise_postcode(pc.group(1))))
    return keys


def parse_existing_slugs(ts_path: Path) -> Set[str]:
    text = ts_path.read_text()
    return set(re.findall(r'slug:\s*"([^"]+)"', text))


def qualifies(type_str: str) -> bool:
    if not type_str:
        return False
    t = type_str.lower()
    for ex in EXCLUSION_TYPE_SUBSTRINGS:
        if ex in t:
            return False
    return any(q in t for q in QUALIFYING_TYPE_SUBSTRINGS)


def parse_about(about_str) -> dict:
    if not about_str:
        return {}
    try:
        return json.loads(about_str)
    except json.JSONDecodeError:
        return {}


def parse_hours(working_hours_str) -> Dict[str, str]:
    if not working_hours_str:
        return {}
    try:
        raw = json.loads(working_hours_str)
    except json.JSONDecodeError:
        return {}
    out: Dict[str, str] = {}
    for day, val in raw.items():
        if isinstance(val, list):
            out[day] = ', '.join(str(v) for v in val) if val else 'Closed'
        elif val:
            out[day] = str(val)
        else:
            out[day] = 'Closed'
    return out


def derive_cuisine(type_str: str) -> str:
    if not type_str:
        return 'Restaurant'
    t = type_str.strip()
    # "Italian restaurant" → "Italian", "Coffee shop" → "Café", "Pub" → "Pub"
    if t.lower().endswith(' restaurant'):
        return t[: -len(' restaurant')].strip().title() or 'Restaurant'
    mapping = {
        'restaurant': 'Restaurant',
        'cafe': 'Café',
        'café': 'Café',
        'coffee shop': 'Café',
        'pub': 'Pub',
        'gastropub': 'Gastropub',
        'bakery': 'Bakery',
        'pizza restaurant': 'Pizza',
        'pizza takeaway': 'Pizza',
        'fish and chips takeaway': 'Fish & chips',
        'fish & chips shop': 'Fish & chips',
        'sandwich shop': 'Sandwich shop',
        'tea house': 'Tea house',
        'tea room': 'Tea room',
        'kebab shop': 'Kebab',
        'takeaway': 'Takeaway',
        'fast food restaurant': 'Fast food',
        'family restaurant': 'Family restaurant',
        'bar & grill': 'Bar & grill',
    }
    return mapping.get(t.lower(), t)


UK_POSTCODE_RE = re.compile(
    r'(?:[A-Z]{1,2}\d[A-Z\d]?|GIR)\s*\d[A-Z]{2}\s*$', re.IGNORECASE
)


def looks_like_real_city(s: str) -> bool:
    """Reject empty, country codes, postcode fragments, numeric-only, street addresses."""
    if not s:
        return False
    s = s.strip()
    if not s:
        return False
    if s.upper() == 'GB':
        return False
    if s.startswith('#'):
        return False
    # Purely numeric (e.g. "100")
    if re.fullmatch(r'\d+', s):
        return False
    # Contains digits → likely a postcode fragment (BS1, 9RZ, 1PQ) or a street
    # number ("33 Fore Hill"). Real UK town names don't have digits.
    if re.search(r'\d', s):
        return False
    # Full or near-full UK postcode mistakenly in city field
    if UK_POSTCODE_RE.match(s):
        return False
    # Street-suffix detector — reject if the value looks like a street, not a town
    street_suffixes = (
        ' street', ' st', ' road', ' rd', ' lane', ' ln', ' way', ' avenue',
        ' ave', ' drive', ' dr', ' close', ' cl', ' place', ' pl', ' court',
        ' crescent', ' cres', ' mews', ' terrace', ' parade', ' square', ' sq',
        ' park', ' hill', ' walk', ' row', ' yard', ' gardens',
    )
    s_lower = ' ' + s.lower()
    for suf in street_suffixes:
        if s_lower.endswith(suf):
            return False
    # Must contain at least one vowel (filters out letter-only postcode shards
    # like 'NW' or 'SW')
    if not re.search(r'[aeiouAEIOU]', s):
        return False
    return True


def tidy_city(s: str) -> str:
    """Title-case shouty inputs (e.g. 'ELY' → 'Ely', 'BURY ST EDMUNDS' → 'Bury St Edmunds')."""
    s = s.strip()
    if s == s.upper() and re.search(r'[A-Z]', s):
        # Title-case but keep small connectors lowercase
        small = {'of', 'the', 'on', 'upon', 'and'}
        words = s.lower().split()
        out = []
        for i, w in enumerate(words):
            if w in small and i != 0:
                out.append(w)
            else:
                out.append(w.capitalize())
        return ' '.join(out)
    return s


def town_from_address(address: str) -> str:
    """Extract a town/city candidate by inspecting comma-split address parts.

    Outscraper addresses can be:
      "Street, Town Postcode"        e.g. "33 Fore Hill, ELY CB7 4AA"
      "Street, Town, Postcode"       e.g. "1 High St, Forest Row, RH18 5DP"
      "Suite, Street, Town Postcode" e.g. "Unit 96 St Nicholas St, 100 BS1 1JQ"
      "GB Bristol, Suite, Street, postcode" — town is the first piece
      "Whitby YO21 3EN"              — single piece after postcode strip is the town

    Strategy: strip postcode, then evaluate every comma-split piece against
    looks_like_real_city. Prefer the LAST valid one (most addresses end with
    the town); if none, return ''.
    """
    if not address:
        return ''
    a = address.strip()
    # Strip the trailing postcode if present
    a = UK_POSTCODE_RE.sub('', a).rstrip(' ,')
    # Strip leading "GB " country code, sometimes injected
    a = re.sub(r'^GB[, ]+', '', a, flags=re.IGNORECASE).strip()
    parts = [p.strip() for p in a.split(',') if p.strip()]
    if not parts:
        return ''
    # Walk from the end backward, return first valid
    for piece in reversed(parts):
        # Some pieces have multiple words like "Forest Row" — those should be
        # accepted whole. But "100 BS1" or "33 Fore Hill" should be rejected.
        if looks_like_real_city(piece):
            return piece
        # Last token of a multi-word piece — sometimes the street and town are
        # in the same piece without a comma (e.g. "Whitby YO21 3EN" already
        # postcode-stripped to "Whitby"). If only one word remains AND it's
        # alphabetic, accept it.
        words = piece.split()
        if len(words) == 1 and looks_like_real_city(words[0]):
            return words[0]
    return ''


def derive_area(city: str, county: str, address: str) -> Tuple[str, str]:
    """Return (display_name, slug). Try in order: city, county, address town."""
    for candidate in (city, county, town_from_address(address)):
        if not candidate:
            continue
        cand = candidate.strip()
        if cand and cand.lower() not in ('none',) and looks_like_real_city(cand):
            nm = tidy_city(cand)
            return nm, slugify(nm)
    return 'Unknown', 'unknown'


def yn_likely(val) -> str:
    if val is True:
        return 'yes'
    if val is False:
        return 'no'
    return 'likely'


def yn(val) -> str:
    return 'yes' if val is True else 'no'


def derive_attributes(about: dict, type_str: str, subtypes: str) -> dict:
    children = about.get('Children') or {}
    service = about.get('Service options') or {}
    accessibility = about.get('Accessibility') or {}
    offerings = about.get('Offerings') or {}
    atmos = about.get('Atmosphere') or {}
    crowd = about.get('Crowd') or {}
    planning = about.get('Planning') or {}
    amenities = about.get('Amenities') or {}

    # noise heuristic
    if atmos.get('Lively') is True or atmos.get('Trendy') is True:
        noise = 'lively'
    elif atmos.get('Cosy') is True or atmos.get('Quiet') is True:
        noise = 'quiet'
    else:
        noise = 'moderate'

    # booking
    if planning.get('Dinner reservations recommended') is True or planning.get('Lunch reservations recommended') is True:
        booking = 'recommended'
    elif planning.get('Accepts reservations') is True:
        booking = 'recommended'
    else:
        booking = 'no'

    # halal: detect via subtypes / type / name
    halal_re = re.compile(r'halal', re.IGNORECASE)
    halal = 'yes' if (subtypes and halal_re.search(subtypes)) or halal_re.search(type_str or '') else 'no'

    return {
        'kidsMenu': yn_likely(children.get("Kids' menu") if "Kids' menu" in children else children.get('Kids menu')),
        'highchairs': yn_likely(children.get('High chairs') if 'High chairs' in children else children.get('Highchairs')),
        'outdoorSpace': yn(service.get('Outdoor seating') is True),
        'softPlay': 'no',
        'babyChanging': yn(amenities.get('Baby changing table') is True or children.get('Baby changing') is True),
        'buggyAccessible': yn_likely(accessibility.get('Wheelchair-accessible entrance')) if 'Wheelchair-accessible entrance' in accessibility else 'likely',
        'noiseLevel': noise,
        'bestForAgeRange': ['all ages'] if children.get('Good for kids') is True or crowd.get('Family friendly') is True else ['all ages'],
        'bookingRequired': booking,
        'veganOptions': yn_likely(offerings.get('Vegan options')) if 'Vegan options' in offerings else 'likely',
        'glutenFreeOptions': 'likely',
        'halalOptions': halal,
    }


def derive_price(range_str) -> str:
    if not range_str:
        return '££'
    s = range_str.strip()
    if s == '£':
        return '£'
    if s == '££':
        return '££'
    if s in ('£££', '££££'):
        return '$$$'  # FFUK schema quirk: top tier encoded as "$$$"
    return '££'


def short_description(name: str, area: str, cuisine: str, rating, review_count, attrs: dict) -> str:
    bits = []
    if attrs['kidsMenu'] == 'yes':
        bits.append('a kids menu')
    if attrs['highchairs'] == 'yes':
        bits.append('highchairs')
    if attrs['outdoorSpace'] == 'yes':
        bits.append('outdoor seating')
    feature_str = ''
    if bits:
        feature_str = f" with {', '.join(bits[:-1])}{(' and ' if len(bits) > 1 else '')}{bits[-1]}"
    rating_str = ''
    if rating is not None:
        try:
            rc = f" — {float(rating):.1f}★"
            if review_count:
                rc += f" ({int(review_count):,} Google reviews)"
            rating_str = rc
        except (TypeError, ValueError):
            pass
    return f"{cuisine.lower().capitalize()} in {area}{feature_str}{rating_str}."


def long_description(name: str, area: str, city: str, cuisine: str, rating, review_count, attrs: dict, address: str) -> str:
    location = area if (not city or city == area) else f"{area}, {city}"
    parts = [f"{name} is a {cuisine.lower()} in {location}."]
    feats: List[str] = []
    if attrs['kidsMenu'] == 'yes':
        feats.append('a dedicated kids menu')
    elif attrs['kidsMenu'] == 'likely':
        feats.append('child-friendly options on the menu')
    if attrs['highchairs'] == 'yes':
        feats.append('highchairs available')
    if attrs['outdoorSpace'] == 'yes':
        feats.append('outdoor seating')
    if attrs['buggyAccessible'] == 'yes':
        feats.append('step-free access for buggies')
    if attrs['babyChanging'] == 'yes':
        feats.append('baby changing facilities')
    if feats:
        parts.append('Features include ' + ', '.join(feats[:-1]) + (f" and {feats[-1]}" if len(feats) > 1 else feats[-1]) + '.')
    if rating is not None:
        try:
            r = float(rating)
            line = f"Currently rated {r:.1f}★ on Google"
            if review_count:
                line += f" from {int(review_count):,} reviews"
            line += '.'
            parts.append(line)
        except (TypeError, ValueError):
            pass
    parts.append('Listing details should be confirmed before visiting — call ahead if you have specific accessibility or dietary needs.')
    return ' '.join(parts)


def derive_tags(type_str: str, subtypes: str, attrs: dict) -> List[str]:
    tags: Set[str] = set()
    if type_str:
        for word in re.split(r'[\s,&/]+', type_str.lower()):
            w = word.strip()
            if 2 < len(w) < 24:
                tags.add(w)
    if subtypes:
        for s in subtypes.split(','):
            s = s.strip().lower()
            if not s:
                continue
            slug = slugify(s)
            if 2 < len(slug) < 30:
                tags.add(slug)
    if attrs['kidsMenu'] == 'yes':
        tags.add('kids-menu')
    if attrs['outdoorSpace'] == 'yes':
        tags.add('outdoor-seating')
    if attrs['highchairs'] == 'yes':
        tags.add('highchairs')
    return sorted(tags)[:8]


def ts_string(s: str) -> str:
    """Encode a string as a TS double-quoted literal."""
    if s is None:
        return '""'
    return json.dumps(str(s), ensure_ascii=False)


def make_id(slug: str) -> str:
    # FFUK uses short ids like c01; for new entries we'll prefix with "x" + slug-hash-like
    # but ids only need uniqueness, so just use slug.
    return f"x-{slug[:40]}"


def format_restaurant_ts(r: dict) -> str:
    lines = [
        f'    id: {ts_string(r["id"])}, slug: {ts_string(r["slug"])}, name: {ts_string(r["name"])},',
        f'    area: {ts_string(r["area"])}, areaSlug: {ts_string(r["areaSlug"])}, city: {ts_string(r["city"])}, citySlug: {ts_string(r["citySlug"])},',
        f'    address: {ts_string(r["address"])}, postcode: {ts_string(r["postcode"])},',
    ]
    contact: list[str] = []
    if r.get('phone'):
        contact.append(f'phone: {ts_string(r["phone"])}')
    if r.get('website'):
        contact.append(f'website: {ts_string(r["website"])}')
    if contact:
        lines.append('    ' + ', '.join(contact) + ',')
    lines += [
        f'    cuisineType: {ts_string(r["cuisineType"])}, priceRange: {ts_string(r["priceRange"])},',
        f'    googleRating: {r["googleRating"]}, reviewCount: {r["reviewCount"]},',
        f'    openingHours: {json.dumps(r["openingHours"], ensure_ascii=False)},',
        f'    lat: {r["lat"]}, lng: {r["lng"]},',
        f'    kidsMenu: {ts_string(r["kidsMenu"])}, highchairs: {ts_string(r["highchairs"])}, outdoorSpace: {ts_string(r["outdoorSpace"])}, softPlay: {ts_string(r["softPlay"])}, babyChanging: {ts_string(r["babyChanging"])}, buggyAccessible: {ts_string(r["buggyAccessible"])}, noiseLevel: {ts_string(r["noiseLevel"])},',
        f'    bestForAgeRange: {json.dumps(r["bestForAgeRange"], ensure_ascii=False)}, bookingRequired: {ts_string(r["bookingRequired"])},',
        f'    veganOptions: {ts_string(r["veganOptions"])}, glutenFreeOptions: {ts_string(r["glutenFreeOptions"])}, halalOptions: {ts_string(r["halalOptions"])},',
        f'    description: {ts_string(r["description"])},',
        f'    shortDescription: {ts_string(r["shortDescription"])},',
        f'    photos: {json.dumps(r["photos"], ensure_ascii=False)},',
        f'    featured: {str(r["featured"]).lower()}, tags: {json.dumps(r["tags"], ensure_ascii=False)},',
    ]
    return '  {\n' + '\n'.join(lines) + '\n  },'


def process_file(path: Path, existing_keys: Set[Tuple[str, str]],
                 used_slugs: Set[str], counter: List[int]) -> List[dict]:
    print(f"\n=== Processing {path.name} ===", file=sys.stderr)
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = list(next(rows))
    idx = {h: i for i, h in enumerate(header)}

    accepted: List[dict] = []
    stats = {
        'total': 0,
        'not_gb': 0,
        'not_operational': 0,
        'low_rating': 0,
        'no_rating': 0,
        'wrong_type': 0,
        'missing_latlng': 0,
        'no_postcode': 0,
        'duplicate_existing': 0,
        'duplicate_intra': 0,
        'not_family_friendly': 0,
        'qualifying': 0,
    }

    for row in rows:
        stats['total'] += 1

        cc = row[idx['country_code']]
        if cc != 'GB':
            stats['not_gb'] += 1
            continue

        bs = row[idx['business_status']]
        if bs != 'OPERATIONAL':
            stats['not_operational'] += 1
            continue

        rating = row[idx['rating']]
        if rating is None:
            stats['no_rating'] += 1
            continue
        try:
            rating_f = float(rating)
        except (TypeError, ValueError):
            stats['no_rating'] += 1
            continue
        if rating_f < 3.8:
            stats['low_rating'] += 1
            continue

        type_str = row[idx['type']] or ''
        if not qualifies(type_str):
            stats['wrong_type'] += 1
            continue

        lat = row[idx['latitude']]
        lng = row[idx['longitude']]
        if lat is None or lng is None:
            stats['missing_latlng'] += 1
            continue

        postcode = row[idx['postal_code']] or ''
        if not postcode.strip():
            stats['no_postcode'] += 1
            continue

        name = (row[idx['name']] or '').strip()
        if not name:
            stats['no_postcode'] += 1
            continue

        key = (normalise_name(name), normalise_postcode(postcode))
        if key in existing_keys:
            stats['duplicate_existing'] += 1
            continue

        # mark before generating slug to avoid intra-file duplicate
        existing_keys.add(key)

        city = (row[idx['city']] or '').strip()
        county = (row[idx['county']] or '').strip() if 'county' in idx else ''
        address = (row[idx['address']] or '').strip()
        area, area_slug = derive_area(city, county, address)
        if area_slug == 'unknown':
            stats['no_postcode'] += 1  # reuse this counter for "no usable town"
            continue

        # slug: base from name + city
        slug_base = slugify(f"{name}-{area}")
        slug = slug_base
        i = 2
        while slug in used_slugs:
            slug = f"{slug_base}-{i}"
            i += 1
        used_slugs.add(slug)

        about = parse_about(row[idx['about']] if 'about' in idx else '')
        subtypes = row[idx['subtypes']] or ''
        attrs = derive_attributes(about, type_str, subtypes)

        # Family-friendliness floor: reject venues where Google explicitly says
        # NO kids menu AND NO highchairs AND NO buggy access. These are unlikely
        # to be useful family-friendly listings even with a high rating.
        if (attrs['kidsMenu'] == 'no'
                and attrs['highchairs'] == 'no'
                and attrs['buggyAccessible'] == 'no'):
            stats['not_family_friendly'] += 1
            continue

        cuisine = derive_cuisine(type_str)
        review_count = row[idx['reviews']] or 0
        try:
            review_count = int(review_count)
        except (TypeError, ValueError):
            review_count = 0

        counter[0] += 1
        rid = make_id(slug)

        record = {
            'id': rid,
            'slug': slug,
            'name': name,
            'area': area,
            'areaSlug': area_slug,
            'city': area,
            'citySlug': area_slug,
            'address': address,
            'postcode': postcode.strip(),
            'phone': (row[idx['phone']] or '').strip(),
            'website': (row[idx['website']] or '').strip(),
            'cuisineType': cuisine,
            'priceRange': derive_price(row[idx['range']] if 'range' in idx else None),
            'googleRating': round(rating_f, 1),
            'reviewCount': review_count,
            'openingHours': parse_hours(row[idx['working_hours']] or ''),
            'lat': lat,
            'lng': lng,
            **attrs,
            'description': long_description(name, area, city, cuisine, rating_f, review_count, attrs, address),
            'shortDescription': short_description(name, area, cuisine, rating_f, review_count, attrs),
            'photos': [],
            'featured': False,
            'tags': derive_tags(type_str, subtypes, attrs),
        }
        accepted.append(record)
        stats['qualifying'] += 1

    print(f"  rows seen        : {stats['total']:>6}", file=sys.stderr)
    print(f"  rejected:", file=sys.stderr)
    print(f"    not GB         : {stats['not_gb']:>6}", file=sys.stderr)
    print(f"    not operational: {stats['not_operational']:>6}", file=sys.stderr)
    print(f"    rating < 3.8   : {stats['low_rating']:>6}", file=sys.stderr)
    print(f"    no rating      : {stats['no_rating']:>6}", file=sys.stderr)
    print(f"    wrong type     : {stats['wrong_type']:>6}", file=sys.stderr)
    print(f"    no lat/lng     : {stats['missing_latlng']:>6}", file=sys.stderr)
    print(f"    no postcode    : {stats['no_postcode']:>6}", file=sys.stderr)
    print(f"    dup (existing) : {stats['duplicate_existing']:>6}", file=sys.stderr)
    print(f"    not family-friendly: {stats['not_family_friendly']:>2}", file=sys.stderr)
    print(f"  ACCEPTED         : {stats['qualifying']:>6}", file=sys.stderr)
    return accepted


def main() -> int:
    existing_keys = parse_existing_keys(DATA_PATH)
    used_slugs = parse_existing_slugs(DATA_PATH)
    print(f"Existing entries: {len(existing_keys)} unique (name, postcode) pairs, {len(used_slugs)} slugs", file=sys.stderr)

    counter = [0]
    new_records: List[dict] = []
    for path in INPUT_FILES:
        if not path.exists():
            print(f"WARN: missing {path}", file=sys.stderr)
            continue
        new_records.extend(process_file(path, existing_keys, used_slugs, counter))

    print(f"\n=== Total new records to add: {len(new_records)} ===", file=sys.stderr)
    if not new_records:
        print("Nothing to add.", file=sys.stderr)
        return 0

    # Group by area for tidy section comments
    by_area: Dict[str, List[dict]] = {}
    for r in new_records:
        by_area.setdefault(r['area'], []).append(r)
    print(f"Areas covered by new data: {len(by_area)}", file=sys.stderr)
    top = sorted(by_area.items(), key=lambda kv: -len(kv[1]))[:10]
    print("Top 10 areas:", file=sys.stderr)
    for a, lst in top:
        print(f"  {len(lst):>4}  {a}", file=sys.stderr)

    # Build TS to insert
    blocks: List[str] = []
    for area in sorted(by_area.keys(), key=lambda a: a.lower()):
        blocks.append(f"  // {area.upper()} (Outscraper import)")
        for r in by_area[area]:
            blocks.append(format_restaurant_ts(r))
    ts_to_insert = '\n'.join(blocks) + '\n'

    # Insert before closing `];` of the restaurants array.
    text = DATA_PATH.read_text()
    # Find `];` marker that follows the last `},` of the array. The first `];` after
    # `export const restaurants` is what we want.
    arr_start = text.index('export const restaurants:')
    end_marker_idx = text.index('\n];\n', arr_start)
    new_text = text[:end_marker_idx + 1] + ts_to_insert + text[end_marker_idx + 1:]
    DATA_PATH.write_text(new_text)
    print(f"Wrote {len(new_records)} records into {DATA_PATH}", file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
