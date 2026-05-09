#!/usr/bin/env python3
"""\
Mine customer review text for the four featured-restaurant signals
(kidsEatFree / toysAvailable / playAreaOnSite / parkNearby) and patch
src/data/restaurants.ts.

Companion to scripts/detect-featured-signals.py — that script reads
description text only; this one reads actual reviews. FFU descriptions
are AI-templated, so the real signal lives in customer reviews.

Usage:
  python3 scripts/extract-review-signals.py path/to/outscraper-reviews.xlsx

The Outscraper Google Maps Reviews export must contain:
  place_id      : matches the existing place_id we recorded at import
  review_text   : the customer-written review (long form)
  reviews_data  : (alternative) JSON array of review objects, each
                  with at least { "review_text": "...", "review_id" }

The script tolerates either shape — long-form-per-row or one-row-per-
place-with-JSON. It also takes name+postcode as a fallback key for
rows where Outscraper omitted the place_id.

For each restaurant, every flag carries an attached `<flag>Snippet`
field: the first review excerpt that triggered it (≤120 chars, with
context). That field is for spot-checking only; the boolean is what
the featured algorithm consumes.

Sentiment guard: if the trigger phrase appears within the same
sentence as a negation/wish word ("wish", "would be nice",
"should", "they don't", "no longer", "doesn't have"), the match is
discarded. Reviewers complaining about absence shouldn't flip the
flag on.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import openpyxl

REPO = Path(__file__).resolve().parent.parent
DATA_PATH = REPO / 'src/data/restaurants.ts'

# ── Patterns ──────────────────────────────────────────────────────────

KIDS_EAT_FREE = [
    r'\bkids? eat (?:for )?free\b',
    r"\bkids'? dine free\b",
    r'\bchildren (?:eat|dine) (?:for )?free\b',
    r"\bfree kids'? meal\b",
    r'\bfree for children\b',
    r"\bkids'? meals? (?:are )?free\b",
    r'\bkids? go free\b',
    r'\bchildren go free\b',
]

TOYS_AVAILABLE = [
    r'\btoy box(?:es)?\b',
    r'\btoy basket\b',
    r'\btoybox\b',
    r"\btoys? for (?:the )?kids?\b",
    r'\btoys? on hand\b',
    r'\btoys? at the table\b',
    r'\bplay corner\b',
    r'\bcolouring (?:sheets?|books?|pages?|station)',
    r'\bcrayons?\b',
    r"\b(?:kids'?|children'?s) activity pack",
    r'\bpuzzles? and games?\b',
    r'\bbooks for (?:the )?children\b',
]

# On-premises play equipment.
PLAY_AREA_ON_SITE = [
    r'play area in (?:the|our|their) (?:beer )?garden',
    r'playground in (?:the|our|their) (?:beer )?garden',
    r"kids'? park in (?:the|our|their) garden",
    r'swings (?:in|at) (?:the|our|their) (?:beer )?garden',
    r'\bclimbing frame\b',
    r'\bsoft play area\b',
    r'\bindoor playground\b',
    r'(?:beer )?garden (?:has|with) (?:a |an )?(?:playground|play area|swings|slide|climbing frame|play equipment)',
    r'on[- ]site (?:play(?:ground|\s+area)?|kids?\s+(?:club|play))',
    r'play equipment (?:in|on) (?:the|our|their|site)',
]

# Genuine public park/playground nearby — not the venue's own play area.
PARK_NEARBY = [
    r'\bpublic park\b',
    r'(?:[A-Z][\w\']+\s+){1,3}park\s+(?:is\s+)?(?:across the road|next door|round the corner|down the (?:street|road)|opposite|just behind)',
    r'\b(?:next to|opposite|across from|round the corner from|down the road from|moments from|minutes from)\s+(?:the\s+)?public park\b',
    r'\b(?:next to|opposite|across from|round the corner from|down the road from|moments from)\s+(?:[A-Z][\w\']+\s+){1,3}park\b',
]

NEGATION_TOKENS = [
    'wish', 'would be nice', 'would like', 'should be', "should've", 'should have',
    "they don't", "they do not", 'no longer', "doesn't have", 'does not have',
    'used to have', 'no kids', 'no childrens', 'never had', 'sadly no',
    'shame', 'shame they', 'pity', "didn't have",
]


def compile_all(patterns):
    return [re.compile(p, re.IGNORECASE) for p in patterns]


KIDS_EAT_FREE_RE = compile_all(KIDS_EAT_FREE)
TOYS_AVAILABLE_RE = compile_all(TOYS_AVAILABLE)
PLAY_AREA_RE = compile_all(PLAY_AREA_ON_SITE)
PARK_NEARBY_RE = compile_all(PARK_NEARBY)


def sentence_around(text: str, span: Tuple[int, int]) -> str:
    """Return the sentence containing the matched span (split on . ! ?)."""
    start, end = span
    # walk left to previous sentence boundary
    s = start
    while s > 0 and text[s - 1] not in '.!?\n':
        s -= 1
    # walk right to next sentence boundary
    e = end
    while e < len(text) and text[e] not in '.!?\n':
        e += 1
    return text[s:e].strip()


def scan(text: str, regexes) -> Optional[str]:
    """Return the snippet that triggered, or None if no positive match."""
    for r in regexes:
        for m in r.finditer(text):
            sentence = sentence_around(text, m.span()).lower()
            if any(neg in sentence for neg in NEGATION_TOKENS):
                continue
            # Trim snippet to ~120 chars centred on the match
            snippet = sentence_around(text, m.span())
            if len(snippet) > 140:
                snippet = snippet[:140].rstrip() + '…'
            return snippet
    return None


# ── Read reviews from XLSX ────────────────────────────────────────────

def reviews_for_place(rows_for_place: List[dict]) -> str:
    """Concatenate all review text we have for a place into one blob."""
    chunks: List[str] = []
    for row in rows_for_place:
        # Long-form: a single review per row
        rt = row.get('review_text') or ''
        if rt and isinstance(rt, str):
            chunks.append(rt)
        # Wide-form: reviews_data column with a JSON array
        rd = row.get('reviews_data') or ''
        if rd and isinstance(rd, str):
            try:
                arr = json.loads(rd)
                if isinstance(arr, list):
                    for rev in arr:
                        if isinstance(rev, dict):
                            t = rev.get('review_text') or rev.get('text') or ''
                            if t:
                                chunks.append(t)
            except json.JSONDecodeError:
                pass
    return '\n'.join(chunks)


def load_reviews_xlsx(path: Path):
    """Yield per-place dict: {'place_id': ..., 'name': ..., 'postal_code': ..., 'reviews_text': ...}."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = list(next(rows))
    idx = {h: i for i, h in enumerate(header)}
    cells = lambda row, key: row[idx[key]] if key in idx else None

    # Group rows by place_id (Outscraper sometimes returns one row per
    # review with the place_id repeated; sometimes one row per place
    # with a JSON column).
    grouped: Dict[str, List[dict]] = {}
    for row in rows:
        pid = cells(row, 'place_id') or ''
        if not pid:
            # fallback key: name + postal_code
            pid = (str(cells(row, 'name') or '') + '|' +
                   str(cells(row, 'postal_code') or ''))
        d = {h: row[i] for h, i in idx.items()}
        grouped.setdefault(pid, []).append(d)

    for pid, rows_for_place in grouped.items():
        first = rows_for_place[0]
        yield {
            'place_id': cells_first := (first.get('place_id') or pid),
            'name': first.get('name') or '',
            'postal_code': first.get('postal_code') or '',
            'reviews_text': reviews_for_place(rows_for_place),
        }


# ── Patch restaurants.ts ──────────────────────────────────────────────

def find_blocks(text: str):
    arr_start = text.index('export const restaurants:')
    arr_open = text.index('[', arr_start)
    arr_close = text.index('\n];\n', arr_open)
    body = text[arr_open + 1:arr_close]
    body_offset = arr_open + 1
    pos = 0
    out = []
    while True:
        m = re.search(r'\n  \{\n', body[pos:])
        if not m:
            break
        start = pos + m.start() + 1
        em = re.search(r'\n  \},', body[start:])
        if not em:
            break
        end = start + em.end()
        out.append({'span': (body_offset + start, body_offset + end), 'block_text': body[start:end]})
        pos = end
    return out


EXISTING_FLAGS_LINE_RE = re.compile(
    r"^    (?:kidsEatFree|toysAvailable|playAreaOnSite|parkNearby)[^\n]*\n",
    re.MULTILINE,
)
EXISTING_SNIPPET_LINES_RE = re.compile(
    r"^    (?:kidsEatFreeSnippet|toysAvailableSnippet|playAreaOnSiteSnippet|parkNearbySnippet):[^\n]*\n",
    re.MULTILINE,
)


def patch_block(block_text: str, flags: Dict[str, bool], snippets: Dict[str, str]) -> str:
    """Replace any existing flags/snippet lines with fresh ones. Insert
    before the bestForAgeRange line."""
    # Strip prior flags + snippets
    block_text = EXISTING_FLAGS_LINE_RE.sub('', block_text)
    block_text = EXISTING_SNIPPET_LINES_RE.sub('', block_text)

    keys = [k for k in ('kidsEatFree', 'toysAvailable', 'playAreaOnSite', 'parkNearby') if flags.get(k)]
    if not keys:
        return block_text

    flags_line = '    ' + ', '.join(f'{k}: true' for k in keys) + ',\n'
    snippet_lines = ''
    for k in keys:
        snip = snippets.get(k, '').replace('\\', '\\\\').replace('"', '\\"').replace('\n', ' ')
        if snip:
            snippet_lines += f'    {k}Snippet: "{snip}",\n'

    insert_re = re.compile(r"^    bestForAgeRange:", re.MULTILINE)
    m = insert_re.search(block_text)
    if not m:
        return block_text
    return block_text[:m.start()] + flags_line + snippet_lines + block_text[m.start():]


def field(block_text: str, name: str) -> str:
    m = re.search(rf'\b{name}:\s*"([^"]*)"', block_text)
    return m.group(1) if m else ''


def normalise_name(s: str) -> str:
    return (s or '').lower().strip()


def normalise_postcode(s: str) -> str:
    return (s or '').upper().replace(' ', '').strip()


# ── Main ──────────────────────────────────────────────────────────────

def main(argv) -> int:
    if len(argv) < 2:
        print('usage: extract-review-signals.py <reviews.xlsx>', file=sys.stderr)
        return 2
    xlsx_path = Path(argv[1])
    if not xlsx_path.exists():
        print(f'ERROR: file not found: {xlsx_path}', file=sys.stderr)
        return 1

    print(f"Loading reviews from {xlsx_path}", file=sys.stderr)
    by_place_id: Dict[str, str] = {}
    by_name_pc: Dict[Tuple[str, str], str] = {}
    for entry in load_reviews_xlsx(xlsx_path):
        if entry['place_id']:
            by_place_id[entry['place_id']] = entry['reviews_text']
        if entry['name'] and entry['postal_code']:
            by_name_pc[(normalise_name(entry['name']), normalise_postcode(entry['postal_code']))] = entry['reviews_text']
    print(f"  places with review text: {len(by_place_id)}", file=sys.stderr)

    print("Loading existing restaurants.ts", file=sys.stderr)
    text = DATA_PATH.read_text()
    blocks = find_blocks(text)
    print(f"  {len(blocks)} blocks", file=sys.stderr)

    counts = {'kidsEatFree': 0, 'toysAvailable': 0, 'playAreaOnSite': 0, 'parkNearby': 0}
    edits: List[Tuple[Tuple[int, int], str, str]] = []
    no_reviews = 0

    for b in blocks:
        bt = b['block_text']
        # Restaurant lookup: try place_id (if it ever lands in restaurants.ts in future),
        # otherwise (name, postcode).
        nm = field(bt, 'name')
        pc = field(bt, 'postcode')
        rev_text = by_name_pc.get((normalise_name(nm), normalise_postcode(pc)))
        if not rev_text:
            no_reviews += 1
            continue

        flags = {
            'kidsEatFree':    bool(snip := scan(rev_text, KIDS_EAT_FREE_RE)),
            'toysAvailable':  False,
            'playAreaOnSite': False,
            'parkNearby':     False,
        }
        snippets = {'kidsEatFree': snip} if flags['kidsEatFree'] else {}

        s = scan(rev_text, TOYS_AVAILABLE_RE);  flags['toysAvailable']  = bool(s); snippets['toysAvailable']  = s or ''
        s = scan(rev_text, PLAY_AREA_RE);       flags['playAreaOnSite'] = bool(s); snippets['playAreaOnSite'] = s or ''
        s = scan(rev_text, PARK_NEARBY_RE);     flags['parkNearby']     = bool(s); snippets['parkNearby']     = s or ''

        for k, v in flags.items():
            if v:
                counts[k] += 1

        new_block = patch_block(bt, flags, snippets)
        if new_block != bt:
            edits.append((b['span'], bt, new_block))

    if not edits:
        print("\nNo signals matched. (Confirmed; nothing to write.)")
        return 0

    edits.sort(key=lambda e: e[0][0])
    parts: List[str] = []
    cursor = 0
    for (start, end), _old, new in edits:
        if start < cursor:
            continue
        parts.append(text[cursor:start])
        parts.append(new)
        cursor = end
    parts.append(text[cursor:])
    DATA_PATH.write_text(''.join(parts))

    print(f"\nReviews-derived signals applied:")
    print(f"  blocks updated      : {len(edits)}")
    print(f"  no reviews found    : {no_reviews}")
    for k, v in counts.items():
        print(f"  {k:<18}: {v}")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
