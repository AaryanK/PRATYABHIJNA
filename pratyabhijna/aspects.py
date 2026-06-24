"""
aspects.py - Vedic dṛṣṭi (aspect) computation from real chart data.

Rules:
- All planets aspect the 7th house from themselves.
- Mars additionally aspects 4th and 8th.
- Jupiter additionally aspects 5th and 9th.
- Saturn additionally aspects 3rd and 10th.
- Rahu/Ketu aspect 5th, 7th, 9th (traditional MVP).
- Conjunctions: planets sharing the same sign/house.
"""
import logging

logger = logging.getLogger(__name__)

SPECIAL_ASPECTS = {
    'Mars':    [4, 7, 8],
    'Jupiter': [5, 7, 9],
    'Saturn':  [3, 7, 10],
    'Rahu':    [5, 7, 9],
    'Ketu':    [5, 7, 9],
}

ASPECT_COLORS = {
    'Sun':     '#f4c978',
    'Moon':    '#e6f2ff',
    'Mars':    '#ff5d67',
    'Mercury': '#2EC4B6',
    'Jupiter': '#ffe8b0',
    'Venus':   '#f472b6',
    'Saturn':  '#818cf8',
    'Rahu':    '#c084fc',
    'Ketu':    '#fda4af',
    'Lagna':   '#00FFCC',
}

SIGN_ORDER = [
    'Aries', 'Taurus', 'Gemini', 'Cancer',
    'Leo', 'Virgo', 'Libra', 'Scorpio',
    'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
]

ORDINAL = {1: 'st', 2: 'nd', 3: 'rd'}


def _ordinal(n: int) -> str:
    return str(n) + ORDINAL.get(n, 'th')


def get_aspect_house(source_house: int, aspect_number: int) -> int:
    """Return the target house for an aspect from source_house."""
    return ((source_house - 1 + aspect_number - 1) % 12) + 1


def compute_aspects(placements: list) -> list:
    """
    Compute all Vedic aspects from a list of placement dicts.
    Each placement must have: name, house, sign.
    Returns list of aspect dicts compatible with frontend rendering.
    """
    aspects = []

    # Build house -> occupants map
    house_occupants: dict[int, list] = {}
    for p in placements:
        h = int(p.get('house', 0))
        if h:
            house_occupants.setdefault(h, []).append(p)

    # Identify lagna sign index for house→sign mapping
    lagna = next((p for p in placements if p['name'] == 'Lagna'), None)
    lagna_sign = lagna['sign'] if lagna else 'Scorpio'
    lagna_sign_idx = SIGN_ORDER.index(lagna_sign) if lagna_sign in SIGN_ORDER else 0

    def house_to_sign(h: int) -> str:
        return SIGN_ORDER[(lagna_sign_idx + h - 1) % 12]

    # ── Conjunctions ──────────────────────────────────────────────────────────
    processed_conj: set = set()
    sources_all = [p for p in placements if p['name'] != 'Lagna']

    for source in sources_all:
        src_house = int(source.get('house', 0))
        if not src_house:
            continue
        same_house = [
            p for p in house_occupants.get(src_house, [])
            if p['name'] != source['name'] and p['name'] != 'Lagna'
        ]
        for target in same_house:
            pair = tuple(sorted([source['name'], target['name']]))
            if pair in processed_conj:
                continue
            processed_conj.add(pair)
            aid = f"conj_{source['name'].lower()}_{target['name'].lower()}"
            aspects.append({
                'id': aid,
                'source': source['name'],
                'from': source['name'],
                'to': target['name'],
                'source_house': src_house,
                'source_sign': source.get('sign', ''),
                'target_house': src_house,
                'target_sign': source.get('sign', ''),
                'aspect_number': 1,
                'aspectNumber': 1,
                'aspect_type': 'conjunction',
                'aspectKind': 'conjunction',
                'targetType': 'graha',
                'fromGraha': source['name'],
                'toGraha': target['name'],
                'targetSign': source.get('sign', ''),
                'receiving_grahas': [target['name']],
                'label': f"{source['name']}–{target['name']} conjunction in H{src_house}",
                'description': (
                    f"{source['name']} and {target['name']} are conjunct "
                    f"in {source.get('sign', '')} H{src_house}."
                ),
                'color': ASPECT_COLORS.get(source['name'], '#ffffff'),
                'strength': 1.0,
                'group': f"{source.get('sign', '')} cluster",
                'importance': 'major',
            })

    # ── Dṛṣṭi aspects ─────────────────────────────────────────────────────────
    for source in sources_all:
        src_house = int(source.get('house', 0))
        if not src_house:
            continue
        src_name = source['name']
        aspect_numbers = SPECIAL_ASPECTS.get(src_name, [7])
        if 7 not in aspect_numbers:
            aspect_numbers = [7] + list(aspect_numbers)

        for asp_num in sorted(set(aspect_numbers)):
            target_house = get_aspect_house(src_house, asp_num)
            target_sign = house_to_sign(target_house)
            receiving = [
                p['name'] for p in house_occupants.get(target_house, [])
                if p['name'] != 'Lagna'
            ]
            target_type = 'graha' if receiving else 'house'
            target_graha = receiving[0] if len(receiving) == 1 else None

            aid = f"{src_name.lower()}_{asp_num}th_h{target_house}"
            aspect_type = 'standard' if asp_num == 7 else 'special'
            importance = 'major' if receiving else 'minor'

            desc = (
                f"{src_name} casts its {_ordinal(asp_num)} dṛṣṭi "
                f"from {source.get('sign', '')} H{src_house} "
                f"into {target_sign} H{target_house}"
            )
            if receiving:
                desc += f", received by {', '.join(receiving)}"
            desc += '.'

            aspects.append({
                'id': aid,
                'source': src_name,
                'from': src_name,
                'to': target_graha or f'H{target_house}',
                'source_house': src_house,
                'source_sign': source.get('sign', ''),
                'target_house': target_house,
                'target_sign': target_sign,
                'aspect_number': asp_num,
                'aspectNumber': asp_num,
                'aspect_type': aspect_type,
                'aspectKind': '7th' if asp_num == 7 else f'{asp_num}th',
                'targetType': target_type,
                'fromGraha': src_name,
                'toGraha': target_graha,
                'targetSign': target_sign,
                'receiving_grahas': receiving,
                'label': f"{src_name} {_ordinal(asp_num)} dṛṣṭi → {target_sign} H{target_house}",
                'description': desc,
                'color': ASPECT_COLORS.get(src_name, '#ffffff'),
                'strength': 1.0,
                'group': (
                    f"{src_name} Special Aspects"
                    if aspect_type == 'special'
                    else f"{src_name} Standard Aspects"
                ),
                'importance': importance,
            })

    return aspects
