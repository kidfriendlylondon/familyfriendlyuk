#!/usr/bin/env python3
"""\
Detect four extra family-friendly signals from the description text in
src/data/restaurants.ts and patch each entry with `<field>: true` lines
when the keywords match. Booleans default to false (omitted when not
detected) so we don't bloat the data file.

Fields:
  kidsEatFree     : "kids eat free" / "kids dine free" promotions
  toysAvailable   : toys / colouring / activity packs at the table
  playAreaOnSite  : on-premises play equipment — pub-garden playground,
                    swings/slide in the beer garden, kids' park out the
                    back. Distinct from parkNearby.
  parkNearby      : a public park / playground / common close enough to
                    walk to. Lesser signal.

Run with: python3 scripts/detect-featured-signals.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

REPO = Path(__file__).resolve().parent.parent
DATA_PATH = REPO / 'src/data/restaurants.ts'

KIDS_EAT_FREE_PATTERNS = [
    r'\bkids? eat (?:for )?free\b',
    r"\bkids'? dine free\b",
    r'\bchildren (?:eat|dine) (?:for )?free\b',
    r'\bkids? meal free with adult\b',
    r'\bkids? go free\b',
    r'\bchildren go free\b',
    r"\bfree kids'? meal\b",
]

TOYS_AVAILABLE_PATTERNS = [
    r'\btoy box(?:es)?\b',
    r'\btoy basket\b',
    r'\btoy area\b(?!.*shop)',
    r'\bplay corner\b',
    r'\bcolouring (?:sheets?|books?|station|pages?)',
    r'\bcrayons?\b',
    r"\b(?:kids'?|children'?s) activity pack",
    r'\bactivity pack for kids\b',
    r'\btoys (?:are )?(?:available|provided|on hand|at the table)\b',
]

# On-premises play equipment. The proximity-and-context tokens
# ("in our garden", "in the beer garden", "on site", "out the back")
# distinguish these from a public park.
PLAY_AREA_ON_SITE_PATTERNS = [
    r'playground (?:in|at) (?:our|the) (?:beer )?garden',
    r'play area (?:in|at) (?:our|the) (?:beer )?garden',
    r'swings (?:in|at) (?:our|the) (?:beer )?garden',
    r'(?:beer )?garden (?:has|with|features|including)\s+(?:a |an )?(?:playground|play area|swings|climbing frame|slide|play equipment)',
    r"kids'? park (?:in|out|at) (?:our|the)",
    r'play equipment (?:in|on) (?:our|the|site)',
    r'\bclimbing frame\b',
    r"kids'? playground (?:in|at) (?:our|the)",
    r'slide(?:s)? in (?:our|the) (?:beer )?garden',
    r'on-site (?:play(?:ground|\s+area)?|kids?\s+(?:club|play))',
    r'park (?:in|out the back of) (?:our|the) (?:garden|venue|premises)',
    r'kids?\s+(?:play\s+)?area\s+(?:on\s+site|at\s+the\s+venue|on\s+the\s+premises)',
]

# Public park / common / playground close enough to walk to. Won't fire
# on "park in our garden" — those phrases match playAreaOnSite above.
PARK_NEARBY_PATTERNS = [
    r'\b(?:near|next to|by|opposite|across from|across the road from|round the corner from|minutes from|just by|moments from)\s+(?:the\s+)?(?:park|playground|common|green)\b',
    r'overlooking (?:the\s+)?(?:park|common|green)',
    r'\bclose to (?:the\s+)?(?:park|playground|common)\b',
    r'\bafter a walk in (?:the\s+)?(?:park|common|woods)\b',
]


def compile_all(patterns):
    return [re.compile(p, re.IGNORECASE) for p in patterns]


KIDS_EAT_FREE_RE = compile_all(KIDS_EAT_FREE_PATTERNS)
TOYS_AVAILABLE_RE = compile_all(TOYS_AVAILABLE_PATTERNS)
PLAY_AREA_ON_SITE_RE = compile_all(PLAY_AREA_ON_SITE_PATTERNS)
PARK_NEARBY_RE = compile_all(PARK_NEARBY_PATTERNS)


def detect(haystack: str, regexes) -> bool:
    return any(r.search(haystack) for r in regexes)


def find_blocks(text: str):
    """Yield each restaurant entry's text + (start, end) span."""
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
        out.append({
            'span': (body_offset + start, body_offset + end),
            'block_text': body[start:end],
        })
        pos = end
    return out


# Match an existing line like:
#   "    kidsEatFree: true, toysAvailable: true,\n"
# (any combination of our four flags). Used so re-runs replace cleanly.
EXISTING_LINE_RE = re.compile(
    r"^    (?:kidsEatFree|toysAvailable|playAreaOnSite|parkNearby)[^\n]*\n",
    re.MULTILINE,
)


def patched(block_text: str, flags: Dict[str, bool]) -> str:
    true_keys = [k for k in ('kidsEatFree', 'toysAvailable', 'playAreaOnSite', 'parkNearby') if flags.get(k)]
    new_line = ('    ' + ', '.join(f'{k}: true' for k in true_keys) + ',\n') if true_keys else ''

    # Replace any existing flags line.
    existing = EXISTING_LINE_RE.search(block_text)
    if existing:
        return block_text[:existing.start()] + new_line + block_text[existing.end():]

    # Insert before bestForAgeRange.
    if not new_line:
        return block_text  # nothing to do
    insert_re = re.compile(r"^    bestForAgeRange:", re.MULTILINE)
    m = insert_re.search(block_text)
    if not m:
        return block_text
    return block_text[:m.start()] + new_line + block_text[m.start():]


def main() -> int:
    text = DATA_PATH.read_text()
    blocks = find_blocks(text)
    print(f"Parsed {len(blocks)} restaurant blocks", file=sys.stderr)

    counts = {'kidsEatFree': 0, 'toysAvailable': 0, 'playAreaOnSite': 0, 'parkNearby': 0}
    edits: List[Tuple[Tuple[int, int], str, str]] = []

    for b in blocks:
        # Scan the whole block — `field("description")` would truncate
        # at the first escaped quote inside the description string.
        haystack = b['block_text'].lower()

        flags = {
            'kidsEatFree': detect(haystack, KIDS_EAT_FREE_RE),
            'toysAvailable': detect(haystack, TOYS_AVAILABLE_RE),
            'playAreaOnSite': detect(haystack, PLAY_AREA_ON_SITE_RE),
            'parkNearby': detect(haystack, PARK_NEARBY_RE),
        }
        for k, v in flags.items():
            if v:
                counts[k] += 1

        new_block = patched(b['block_text'], flags)
        if new_block != b['block_text']:
            edits.append((b['span'], b['block_text'], new_block))

    if not edits:
        print('No matches.')
        return 0

    # Streaming O(n) write — collect slices, concat once.
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

    print(f"\nEntries touched               : {len(edits)}")
    for k, v in counts.items():
        print(f"  {k:<18}  {v}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
