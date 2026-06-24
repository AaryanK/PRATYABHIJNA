"""
ephemeris.py - Planet position calculation with layered backend strategy.

Priority order:
1. swisseph (pyswisseph) — most accurate, requires MSVC on Windows
2. pure_ephem — pure-Python VSOP87/Meeus, always available, ~1-5' accuracy
3. Raises RuntimeError if both fail (should never happen)

The pure-Python backend is accurate enough for Vedic D1 charts.
"""
import logging
from pratyabhijna.vedic import build_placement, longitude_to_sign_index
from pratyabhijna.interpretations import generate_interpretation

logger = logging.getLogger(__name__)

# ── Try swisseph ─────────────────────────────────────────────────────────────
try:
    import swisseph as swe
    _HAS_SWE = True
    logger.info("swisseph available as ephemeris backend.")
except ImportError:
    _HAS_SWE = False
    logger.info("swisseph not available; will use pure-Python ephemeris.")

# ── Pure-Python ephemeris is always available ─────────────────────────────────
from pratyabhijna.pure_ephem import calculate_all as _pure_calculate_all
from pratyabhijna.pure_ephem import julday as _julday_py, lahiri_ayanamsha as _lahiri


AYANAMSHA_MAP_SWE = None
if _HAS_SWE:
    AYANAMSHA_MAP_SWE = {
        'LAHIRI':       swe.SIDM_LAHIRI,
        'RAMAN':        swe.SIDM_RAMAN,
        'KRISHNAMURTI': swe.SIDM_KRISHNAMURTI,
        'TRUE_CITRA':   swe.SIDM_TRUE_CITRA,
    }


def _calculate_swisseph(jd_ut: float, lat: float, lon_geo: float, ayanamsha: str) -> dict:
    """Calculate using pyswisseph (most accurate)."""
    sid_mode = AYANAMSHA_MAP_SWE.get(ayanamsha.upper(), swe.SIDM_LAHIRI)
    swe.set_sid_mode(sid_mode)
    flags = swe.FLG_SWIEPH | swe.FLG_SIDEREAL | swe.FLG_SPEED

    PLANET_IDS = {
        'Sun': swe.SUN, 'Moon': swe.MOON, 'Mars': swe.MARS,
        'Mercury': swe.MERCURY, 'Jupiter': swe.JUPITER,
        'Venus': swe.VENUS, 'Saturn': swe.SATURN,
    }
    positions = {}
    for name, pid in PLANET_IDS.items():
        result, _ = swe.calc_ut(jd_ut, pid, flags)
        positions[name] = {
            'longitude': result[0] % 360.0,
            'latitude': result[1],
            'distance': result[2],
            'speed': result[3],
            'retrograde': result[3] < 0,
        }
    # Rahu / Ketu
    result, _ = swe.calc_ut(jd_ut, swe.MEAN_NODE, flags)
    rahu_lon = result[0] % 360.0
    positions['Rahu'] = {'longitude': rahu_lon, 'latitude': result[1],
                          'distance': result[2], 'speed': result[3], 'retrograde': True}
    positions['Ketu'] = {'longitude': (rahu_lon + 180.0) % 360.0, 'latitude': -result[1],
                          'distance': result[2], 'speed': result[3], 'retrograde': True}
    # Ascendant
    cusps, ascmc = swe.houses_ex(jd_ut, lat, lon_geo, b'P', swe.FLG_SIDEREAL)
    asc_lon = ascmc[0] % 360.0

    return {'lagna_longitude': asc_lon, 'positions': positions}


def _calculate_pure(jd_ut: float, lat: float, lon_geo: float, ayanamsha: str) -> dict:
    """Calculate using pure-Python VSOP87/Meeus (no C compiler needed)."""
    # Only Lahiri supported in pure-Python backend; warn for others
    if ayanamsha.upper() != 'LAHIRI':
        logger.warning(f"Pure-Python backend only supports Lahiri ayanamsha; ignoring '{ayanamsha}'.")
    return _pure_calculate_all(jd_ut, lat, lon_geo)


def build_full_chart(
    year: int, month: int, day: int,
    hour: int, minute: int,
    lat: float, lon_geo: float,
    tz_str: str,
    jd_ut: float = None,
    ayanamsha: str = 'LAHIRI',
) -> list:
    """
    Calculate full D1 chart and return list of placement dicts.

    Tries swisseph → pure-Python → raises RuntimeError.

    Args:
        year, month, day, hour, minute – birth datetime (local, for jd_ut if not provided)
        lat, lon_geo – geographic coordinates
        tz_str – IANA timezone (not used directly here; jd_ut is pre-computed by caller)
        jd_ut – Julian Day UT (if None, computed from local datetime using pure-Python)
        ayanamsha – e.g. 'LAHIRI'

    Returns:
        list of placement dicts compatible with frontend mandala
    """
    # Compute JD if not provided (caller should always provide it)
    if jd_ut is None:
        hour_dec = hour + minute / 60.0
        jd_ut = _julday_py(year, month, day, hour_dec)
        logger.info(f"Computed JD internally: {jd_ut}")

    raw = None

    # Try swisseph first
    if _HAS_SWE:
        try:
            raw = _calculate_swisseph(jd_ut, lat, lon_geo, ayanamsha)
            logger.info("Chart calculated using swisseph backend.")
        except Exception as e:
            logger.error(f"swisseph failed: {e}")

    # Fall back to pure Python
    if raw is None:
        try:
            raw = _calculate_pure(jd_ut, lat, lon_geo, ayanamsha)
            logger.info("Chart calculated using pure-Python ephemeris backend.")
        except Exception as e:
            logger.error(f"Pure-Python ephemeris failed: {e}")
            raise RuntimeError("All ephemeris backends failed.") from e

    lagna_lon = raw['lagna_longitude']
    lagna_sign_idx = longitude_to_sign_index(lagna_lon)
    positions = raw['positions']

    placements = []

    # Lagna
    lagna_p = build_placement(
        name='Lagna',
        longitude=lagna_lon,
        lagna_sign_index=lagna_sign_idx,
        retrograde=False,
        speed=0.0,
    )
    lagna_p['interpretation'] = generate_interpretation(
        'Lagna', lagna_p['sign'], lagna_p['house'], lagna_p['nakshatra']
    )
    placements.append(lagna_p)

    # Planets in standard order
    GRAHA_ORDER = [
        'Sun', 'Moon', 'Mars', 'Mercury',
        'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'
    ]
    for name in GRAHA_ORDER:
        pos = positions.get(name)
        if pos is None:
            continue
        p = build_placement(
            name=name,
            longitude=pos['longitude'],
            lagna_sign_index=lagna_sign_idx,
            retrograde=pos.get('retrograde', False),
            speed=pos.get('speed', 0.0),
        )
        p['interpretation'] = generate_interpretation(
            name, p['sign'], p['house'], p['nakshatra'],
            retrograde=pos.get('retrograde', False),
        )
        placements.append(p)

    return placements
