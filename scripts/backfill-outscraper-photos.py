#!/usr/bin/env python3
"""\
Backfill restaurant photos from the existing Outscraper exports.

Each Outscraper row has a `photo` URL (Google CDN). We never imported
those — restaurants.ts entries have empty `photos: []`. This script
matches existing restaurants to Outscraper rows by (name, postcode) and
patches in the URL when both sides have one.

It only modifies restaurants whose `photos` array is currently empty —
locally-fetched images (e.g. /images/restaurants/...) are left alone.

Run with: python3 scripts/backfill-outscraper-photos.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import openpyxl

REPO = Path(__file__).resolve().parent.parent
DATA_PATH = REPO / 'src/data/restaurants.ts'

INPUT_FILES = [
    Path('/Users/natalieellis/Downloads/Outscraper-20260504203246s27.xlsx'),
    Path('/Users/natalieellis/Downloads/Outscraper-20260504204608s71.xlsx'),
]


def normalise_name(s: str) -> str:
    return (s or '').lower().strip()


def normalise_postcode(s: str) -> str:
    return (s or '').upper().replace(' ', '').strip()


def collect_outscraper_photos() -> Dict[Tuple[str, str], List[str]]:
    """Return {(lower_name, no_space_postcode): [photo_urls]}.
    Each restaurant has one Outscraper photo URL — we keep it as a list
    for forward compatibility."""
    out: Dict[Tuple[str, str], List[str]] = {}
    for path in INPUT_FILES:
        if not path.exists():
            print(f"WARN: missing {path}", file=sys.stderr)
            continue
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.active
        rows = ws.iter_rows(values_only=True)
        header = list(next(rows))
        idx = {h: i for i, h in enumerate(header)}
        if 'photo' not in idx:
            continue
        for row in rows:
            name = (row[idx['name']] or '').strip()
            pc = (row[idx['postal_code']] or '').strip()
            photo = (row[idx['photo']] or '').strip()
            if not name or not pc or not photo:
                continue
            key = (normalise_name(name), normalise_postcode(pc))
            if key not in out:
                out[key] = [photo]
    return out


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
        out.append({
            'span': (body_offset + start, body_offset + end),
            'block_text': body[start:end],
        })
        pos = end
    return out


def field(block_text: str, name: str) -> str:
    m = re.search(rf'\b{name}:\s*"([^"]*)"', block_text)
    return m.group(1) if m else ''


def main() -> int:
    text = DATA_PATH.read_text()
    blocks = find_blocks(text)
    print(f"Parsed {len(blocks)} restaurant blocks", file=sys.stderr)

    photo_index = collect_outscraper_photos()
    print(f"Found {len(photo_index)} (name, postcode) → photo entries in Outscraper data",
          file=sys.stderr)

    edits = []
    matched = 0
    skipped_already_have = 0
    no_match = 0

    for b in blocks:
        block_text = b['block_text']
        # Skip if the entry already has a non-empty photos array.
        photos_match = re.search(r'photos:\s*\[(.*?)\]', block_text)
        if not photos_match:
            continue
        if photos_match.group(1).strip():
            skipped_already_have += 1
            continue

        name = field(block_text, 'name')
        postcode = field(block_text, 'postcode')
        key = (normalise_name(name), normalise_postcode(postcode))
        urls = photo_index.get(key)
        if not urls:
            no_match += 1
            continue

        photos_array = ','.join(f'"{u}"' for u in urls)
        new_block = block_text.replace(
            photos_match.group(0),
            f'photos: [{photos_array}]',
            1,
        )
        edits.append((b['span'], block_text, new_block))
        matched += 1

    if not edits:
        print('Nothing to update.')
        return 0

    edits.sort(key=lambda e: e[0][0], reverse=True)
    out = text
    for (start, end), old, new in edits:
        block = out[start:end]
        if old not in block:
            continue
        out = out[:start] + block.replace(old, new, 1) + out[end:]
    DATA_PATH.write_text(out)

    print(f"\nRestaurants gaining photos: {matched}")
    print(f"Already had photos        : {skipped_already_have}")
    print(f"No Outscraper match       : {no_match}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
