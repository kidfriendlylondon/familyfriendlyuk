#!/usr/bin/env python3
"""\
Detect soft-play / amusement / Wacky Warehouse venues in the Outscraper
exports that share an address (or phone number) with an existing
restaurant or pub in src/data/restaurants.ts. When a match is found, set
the parent restaurant's softPlay = "yes" and store the soft-play venue's
name in a new softPlayName field.

Run with: python3 scripts/attach-soft-play.py
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import openpyxl

REPO = Path(__file__).resolve().parent.parent
DATA_PATH = REPO / 'src/data/restaurants.ts'

INPUT_FILES = [
    Path('/Users/natalieellis/Downloads/Outscraper-20260504203246s27.xlsx'),
    Path('/Users/natalieellis/Downloads/Outscraper-20260504204608s71.xlsx'),
]

# Soft-play type signals. We deliberately exclude "play cafe" / "children's
# cafe" / "family restaurant" — those are standalone food venues, not the
# attached-soft-play pattern this script is hunting for.
SOFT_PLAY_SUBSTRINGS = [
    'soft play',
    'wacky warehouse',
    "children's amusement centre",
    "children's amusement center",
    'amusement centre',
    'amusement center',
    'indoor playground',
]
EXCLUDE_SOFT_PLAY = ['amusement park', 'theme park', 'amusement park ride']


def is_soft_play_type(type_str: str) -> bool:
    if not type_str:
        return False
    t = type_str.lower()
    if any(x in t for x in EXCLUDE_SOFT_PLAY):
        return False
    return any(s in t for s in SOFT_PLAY_SUBSTRINGS)


def normalise_phone(p: str) -> str:
    """Last 10 digits — robust against +44 / 0 prefixes and spacing."""
    digits = re.sub(r'\D', '', p or '')
    return digits[-10:] if len(digits) >= 10 else ''


def normalise_postcode(pc: str) -> str:
    return (pc or '').upper().replace(' ', '').strip()


def street_footprint(address: str, postcode: str) -> str:
    """Lowercased alphanumeric of the address with the postcode and any
    leading street numbers stripped — used for fuzzy substring matching
    between two venues at the same building."""
    a = (address or '').lower()
    if postcode:
        a = a.replace(postcode.lower(), '')
        a = a.replace(postcode.replace(' ', '').lower(), '')
    a = re.sub(r'\bunit\s*\d+\b', '', a)
    a = re.sub(r'[^a-z0-9 ]', ' ', a)
    a = re.sub(r'\s+', ' ', a).strip()
    # Drop leading number tokens — "12 high street" → "high street"
    a = re.sub(r'^\d+\s+', '', a)
    return a


def share_street(addr_a: str, pc_a: str, addr_b: str, pc_b: str) -> bool:
    """Return True if the two normalised addresses share at least 8 chars
    of contiguous text. Tightens to 12 if either side is short."""
    fa = street_footprint(addr_a, pc_a)
    fb = street_footprint(addr_b, pc_b)
    if not fa or not fb:
        return False
    if fa == fb:
        return True
    short, long_ = (fa, fb) if len(fa) <= len(fb) else (fb, fa)
    if len(short) < 8:
        return False
    # Substring match — robust when one address has extra prefix tokens
    # like "Wacky Warehouse, " or "Unit 5, ".
    if short in long_:
        return True
    # Look for any 12-char contiguous overlap.
    for i in range(0, len(short) - 11):
        if short[i:i + 12] in long_:
            return True
    return False


# ----- Parse existing restaurants ---------------------------------------

def parse_restaurant_blocks(text: str) -> List[Dict]:
    """Yield {name, postcode, address, phone, soft_play, span} for each entry."""
    arr_start = text.index('export const restaurants:')
    arr_open = text.index('[', arr_start)
    arr_close = text.index('\n];\n', arr_open)
    body = text[arr_open + 1:arr_close]
    body_offset = arr_open + 1

    blocks: List[Dict] = []
    pos = 0
    while True:
        # Find the next "  {" at start of line
        match = re.search(r'\n  \{\n', body[pos:])
        if not match:
            break
        start = pos + match.start() + 1  # skip the leading \n
        # find matching closing "\n  },"
        end_match = re.search(r'\n  \},', body[start:])
        if not end_match:
            break
        end = start + end_match.end()  # include "\n  },"
        block_text = body[start:end]

        def field(name: str) -> str:
            m = re.search(rf'\b{name}:\s*"([^"]*)"', block_text)
            return m.group(1) if m else ''

        blocks.append({
            'name': field('name'),
            'postcode': field('postcode'),
            'address': field('address'),
            'phone': field('phone'),
            'softPlay': field('softPlay'),
            'span': (body_offset + start, body_offset + end),
            'block_text': block_text,
        })
        pos = end
    return blocks


def write_modifications(text: str, mods: List[Tuple[Tuple[int, int], str, str]]) -> str:
    """Apply (span, old, new) replacements to text, sorted from end to start
    so earlier spans aren't invalidated by edits later in the file."""
    mods_sorted = sorted(mods, key=lambda m: m[0][0], reverse=True)
    out = text
    for (start, end), old, new in mods_sorted:
        block = out[start:end]
        if old not in block:
            continue
        new_block = block.replace(old, new, 1)
        out = out[:start] + new_block + out[end:]
    return out


# ----- Soft-play discovery ----------------------------------------------

def collect_soft_play_candidates() -> List[Dict]:
    candidates: List[Dict] = []
    for path in INPUT_FILES:
        if not path.exists():
            print(f"WARN: missing {path}", file=sys.stderr)
            continue
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.active
        rows = ws.iter_rows(values_only=True)
        header = list(next(rows))
        idx = {h: i for i, h in enumerate(header)}
        for row in rows:
            type_ = row[idx['type']] or ''
            if not is_soft_play_type(type_):
                continue
            cc = row[idx['country_code']]
            if cc != 'GB':
                continue
            bs = row[idx['business_status']]
            if bs == 'CLOSED_PERMANENTLY':
                continue
            candidates.append({
                'name': (row[idx['name']] or '').strip(),
                'type': type_,
                'address': (row[idx['address']] or '').strip(),
                'postcode': (row[idx['postal_code']] or '').strip(),
                'phone': (row[idx['phone']] or '').strip(),
            })
    return candidates


# ----- Matching ----------------------------------------------------------

def build_restaurant_indices(blocks: List[Dict]):
    by_phone: Dict[str, List[int]] = defaultdict(list)
    by_postcode: Dict[str, List[int]] = defaultdict(list)
    for i, b in enumerate(blocks):
        ph = normalise_phone(b['phone'])
        if ph:
            by_phone[ph].append(i)
        pc = normalise_postcode(b['postcode'])
        if pc:
            by_postcode[pc].append(i)
    return by_phone, by_postcode


def find_matches(
    blocks: List[Dict],
    candidates: List[Dict],
):
    by_phone, by_postcode = build_restaurant_indices(blocks)
    matches_by_block: Dict[int, Dict] = {}
    for cand in candidates:
        ph = normalise_phone(cand['phone'])
        pc = normalise_postcode(cand['postcode'])

        # 1) Phone match (exact)
        candidate_block_idxs: List[int] = []
        if ph and ph in by_phone:
            candidate_block_idxs.extend(by_phone[ph])

        # 2) Same postcode + fuzzy street
        if pc and pc in by_postcode:
            for i in by_postcode[pc]:
                if i in candidate_block_idxs:
                    continue
                b = blocks[i]
                if share_street(cand['address'], pc, b['address'], normalise_postcode(b['postcode'])):
                    candidate_block_idxs.append(i)

        for i in candidate_block_idxs:
            # Skip if the block IS the soft-play venue itself (same name).
            if blocks[i]['name'].lower() == cand['name'].lower():
                continue
            # Keep the first soft-play match per restaurant — usually only one.
            if i not in matches_by_block:
                matches_by_block[i] = cand
    return matches_by_block


# ----- Main --------------------------------------------------------------

def main() -> int:
    text = DATA_PATH.read_text()
    blocks = parse_restaurant_blocks(text)
    print(f"Parsed {len(blocks)} restaurant blocks", file=sys.stderr)

    candidates = collect_soft_play_candidates()
    print(f"Found {len(candidates)} soft-play candidates in Outscraper data", file=sys.stderr)

    matches = find_matches(blocks, candidates)
    print(f"\nMatched {len(matches)} restaurants with attached soft play", file=sys.stderr)
    if matches:
        print("Sample matches:", file=sys.stderr)
        for i, cand in list(matches.items())[:8]:
            b = blocks[i]
            print(f"  - {b['name']!r} ({b['postcode']}) ↔ {cand['name']!r} ({cand['type']})",
                  file=sys.stderr)

    # Build per-block edits.
    mods: List[Tuple[Tuple[int, int], str, str]] = []
    flagged = 0
    for i, cand in matches.items():
        b = blocks[i]
        soft_play_name = cand['name'].replace('"', "'")
        block_text = b['block_text']

        # Replace `softPlay: "no"` (or "yes" — re-marking is fine) and add
        # softPlayName next to it. Idempotent: skip if softPlayName already
        # present.
        if 'softPlayName:' in block_text:
            continue

        new_attr = f'softPlay: "yes", softPlayName: "{soft_play_name}"'
        # Find current softPlay value
        m = re.search(r'softPlay:\s*"(?:yes|no)"', block_text)
        if not m:
            continue
        old_attr = m.group(0)
        mods.append((b['span'], old_attr, new_attr))
        flagged += 1

    if mods:
        new_text = write_modifications(text, mods)
        DATA_PATH.write_text(new_text)
    print(f"\nUpdated {flagged} restaurant entries", file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
