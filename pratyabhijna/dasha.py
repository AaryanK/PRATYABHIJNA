"""
dasha.py - Vimshottari Dasha calculation engine.
Uses Moon's nakshatra lord and elapsed fraction to compute Mahadasha/Antardasha.
"""
import logging
from datetime import date, timedelta
from pratyabhijna.vedic import NAKSHATRAS, NAKSHATRA_SIZE

logger = logging.getLogger(__name__)

VIMSHOTTARI_ORDER = [
    'Ketu', 'Venus', 'Sun', 'Moon', 'Mars',
    'Rahu', 'Jupiter', 'Saturn', 'Mercury'
]

VIMSHOTTARI_YEARS = {
    'Ketu':    7,
    'Venus':   20,
    'Sun':     6,
    'Moon':    10,
    'Mars':    7,
    'Rahu':    18,
    'Jupiter': 16,
    'Saturn':  19,
    'Mercury': 17,
}

TOTAL_CYCLE = sum(VIMSHOTTARI_YEARS.values())  # 120 years


def _next_lord(lord: str) -> str:
    idx = VIMSHOTTARI_ORDER.index(lord)
    return VIMSHOTTARI_ORDER[(idx + 1) % 9]


def _days_for_years(years: float) -> float:
    return years * 365.25


def compute_dasha(moon_longitude: float, birth_date_str: str,
                  current_date_str: str = None) -> dict:
    """
    Compute Vimshottari Dasha details.

    Args:
        moon_longitude: Sidereal Moon longitude (0–360°)
        birth_date_str: "YYYY-MM-DD"
        current_date_str: "YYYY-MM-DD" (defaults to today)

    Returns:
        dict with birth_nakshatra, mahadasha_at_birth, current, timeline, antardashas
    """
    if current_date_str is None:
        current_date_str = date.today().isoformat()

    birth_dt = date.fromisoformat(birth_date_str)
    current_dt = date.fromisoformat(current_date_str)

    moon_lon = moon_longitude % 360.0
    nak_index = min(int(moon_lon // NAKSHATRA_SIZE), 26)
    offset = moon_lon - (nak_index * NAKSHATRA_SIZE)
    elapsed_fraction = offset / NAKSHATRA_SIZE
    remaining_fraction = 1.0 - elapsed_fraction

    nak_name, nak_lord = NAKSHATRAS[nak_index]

    lord_years = VIMSHOTTARI_YEARS[nak_lord]
    balance_years = lord_years * remaining_fraction
    balance_days = _days_for_years(balance_years)

    # ── Build Mahadasha timeline ───────────────────────────────────────────────
    timeline = []
    current_lord = nak_lord
    start_dt = birth_dt

    # First (possibly partial) mahadasha
    end_dt = start_dt + timedelta(days=balance_days)
    timeline.append({
        'level': 'mahadasha',
        'lord': current_lord,
        'start': start_dt.isoformat(),
        'end': end_dt.isoformat(),
        'years': round(balance_years, 4),
        'partial': True,
    })

    # Subsequent full mahadashas (enough to cover ~200 years)
    for _ in range(18):
        current_lord = _next_lord(current_lord)
        start_dt = end_dt
        years = VIMSHOTTARI_YEARS[current_lord]
        end_dt = start_dt + timedelta(days=_days_for_years(years))
        timeline.append({
            'level': 'mahadasha',
            'lord': current_lord,
            'start': start_dt.isoformat(),
            'end': end_dt.isoformat(),
            'years': years,
            'partial': False,
        })

    # ── Find current Mahadasha ─────────────────────────────────────────────────
    current_maha = None
    for period in timeline:
        pd_start = date.fromisoformat(period['start'])
        pd_end = date.fromisoformat(period['end'])
        if pd_start <= current_dt < pd_end:
            current_maha = period
            break
    if current_maha is None:
        current_maha = timeline[-1]

    # ── Compute Antardashas within current Mahadasha ───────────────────────────
    antardashas = []
    if current_maha:
        maha_lord = current_maha['lord']
        maha_start = date.fromisoformat(current_maha['start'])
        if current_maha.get('partial'):
            maha_total_days = _days_for_years(current_maha['years'])
        else:
            maha_total_days = _days_for_years(VIMSHOTTARI_YEARS[maha_lord])

        antar_start = maha_start
        antar_lord = maha_lord
        for _ in range(9):
            ratio = VIMSHOTTARI_YEARS[antar_lord] / TOTAL_CYCLE
            antar_days = maha_total_days * ratio
            antar_end = antar_start + timedelta(days=antar_days)
            antardashas.append({
                'lord': antar_lord,
                'start': antar_start.isoformat(),
                'end': antar_end.isoformat(),
                'days': round(antar_days, 1),
            })
            antar_start = antar_end
            antar_lord = _next_lord(antar_lord)

    current_antar = None
    for a in antardashas:
        a_start = date.fromisoformat(a['start'])
        a_end = date.fromisoformat(a['end'])
        if a_start <= current_dt < a_end:
            current_antar = a
            break
    if current_antar is None and antardashas:
        current_antar = antardashas[-1]

    return {
        'birth_nakshatra': nak_name,
        'birth_nakshatra_lord': nak_lord,
        'moon_longitude': round(moon_lon, 4),
        'nakshatra_index': nak_index,
        'elapsed_fraction': round(elapsed_fraction, 4),
        'mahadasha_at_birth': {
            'lord': nak_lord,
            'balance_years': round(balance_years, 4),
        },
        'current': {
            'mahadasha': current_maha['lord'] if current_maha else None,
            'mahadasha_start': current_maha['start'] if current_maha else None,
            'mahadasha_end': current_maha['end'] if current_maha else None,
            'antardasha': current_antar['lord'] if current_antar else None,
            'antardasha_start': current_antar['start'] if current_antar else None,
            'antardasha_end': current_antar['end'] if current_antar else None,
        },
        'timeline': timeline[:12],
        'antardashas': antardashas,
    }
