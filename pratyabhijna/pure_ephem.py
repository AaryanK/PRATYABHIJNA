"""
pure_ephem.py - Pure-Python planetary position calculator for Pratyabhijna.

This is an MVP fallback backend. It uses corrected Julian Day handling,
Lahiri ayanamsha, geocentric ecliptic longitudes for visible planets, mean
Rahu/Ketu, and an LST-based Ascendant.

For production-grade Jyotisha, prefer Swiss Ephemeris (pyswisseph). This file is
intended to keep the app working when binary dependencies are unavailable.
"""

import math
from typing import Dict, Tuple, Optional

# ── Fundamental constants ──────────────────────────────────────────────────────
J2000 = 2451545.0
RAD = math.pi / 180.0
DEG = 180.0 / math.pi

# Lahiri ayanamsha approximation.
# At J2000.0: about 23°51'11" = 23.853056°.
# Precession rate: about 50.3 arcsec/year.
LAHIRI_J2000 = 23.853056
AYANAMSHA_RATE = 50.3 / 3600.0  # degrees per Julian year


# ── Generic helpers ────────────────────────────────────────────────────────────
def _norm(deg: float) -> float:
    """Normalize angle to 0 <= angle < 360."""
    return deg % 360.0


def _angle_delta(lon2: float, lon1: float) -> float:
    """Shortest signed angular difference lon2 - lon1 in degrees."""
    return (lon2 - lon1 + 180.0) % 360.0 - 180.0


def julday(year: int, month: int, day: int, hour_decimal: float) -> float:
    """
    Julian Day Number using the Gregorian calendar.

    IMPORTANT: hour_decimal is UT hours, not a day fraction.
    Example: 03:20 UTC => hour_decimal = 3 + 20/60 = 3.333333.
    """
    y = year
    m = month

    if m <= 2:
        y -= 1
        m += 12

    A = int(y / 100)
    B = 2 - A + int(A / 4)

    return (
        int(365.25 * (y + 4716))
        + int(30.6001 * (m + 1))
        + day
        + hour_decimal / 24.0
        + B
        - 1524.5
    )


def _T(jd: float) -> float:
    """Julian centuries from J2000.0."""
    return (jd - J2000) / 36525.0


def lahiri_ayanamsha(jd: float) -> float:
    """
    Approximate Lahiri ayanamsha in degrees for a given Julian Day.

    Ayanamsha increases after J2000, so this must ADD the precession term.
    """
    years_from_j2000 = (jd - J2000) / 365.25
    return LAHIRI_J2000 + AYANAMSHA_RATE * years_from_j2000


# ── Low-precision orbital model ────────────────────────────────────────────────
def _days_since_schlyter_epoch(jd: float) -> float:
    """
    Days since 2000 Jan 0.0 UT.

    These orbital elements use the common low-precision epoch JD 2451543.5.
    """
    return jd - 2451543.5


def _kepler_eccentric_anomaly(M_deg: float, e: float) -> float:
    """Solve Kepler's equation. Returns eccentric anomaly in degrees."""
    M = _norm(M_deg)
    E = M + DEG * e * math.sin(M * RAD) * (1.0 + e * math.cos(M * RAD))

    for _ in range(8):
        E = E - (E - DEG * e * math.sin(E * RAD) - M) / (1.0 - e * math.cos(E * RAD))

    return E


def _orbital_elements(name: str, jd: float) -> Tuple[float, float, float, float, float, float]:
    """
    Return approximate orbital elements:
    N = longitude of ascending node
    i = inclination
    w = argument of perihelion
    a = semi-major axis
    e = eccentricity
    M = mean anomaly
    """
    d = _days_since_schlyter_epoch(jd)

    if name == "Mercury":
        return (
            48.3313 + 3.24587e-5 * d,
            7.0047 + 5.00e-8 * d,
            29.1241 + 1.01444e-5 * d,
            0.387098,
            0.205635 + 5.59e-10 * d,
            168.6562 + 4.0923344368 * d,
        )

    if name == "Venus":
        return (
            76.6799 + 2.46590e-5 * d,
            3.3946 + 2.75e-8 * d,
            54.8910 + 1.38374e-5 * d,
            0.723330,
            0.006773 - 1.302e-9 * d,
            48.0052 + 1.6021302244 * d,
        )

    # This element set returns the Sun's geocentric vector when name == "Earth".
    # It is used as the Earth-to-Sun vector for geocentric planet conversion.
    if name == "Earth":
        return (
            0.0,
            0.0,
            282.9404 + 4.70935e-5 * d,
            1.000000,
            0.016709 - 1.151e-9 * d,
            356.0470 + 0.9856002585 * d,
        )

    if name == "Mars":
        return (
            49.5574 + 2.11081e-5 * d,
            1.8497 - 1.78e-8 * d,
            286.5016 + 2.92961e-5 * d,
            1.523688,
            0.093405 + 2.516e-9 * d,
            18.6021 + 0.5240207766 * d,
        )

    if name == "Jupiter":
        return (
            100.4542 + 2.76854e-5 * d,
            1.3030 - 1.557e-7 * d,
            273.8777 + 1.64505e-5 * d,
            5.20256,
            0.048498 + 4.469e-9 * d,
            19.8950 + 0.0830853001 * d,
        )

    if name == "Saturn":
        return (
            113.6634 + 2.38980e-5 * d,
            2.4886 - 1.081e-7 * d,
            339.3939 + 2.97661e-5 * d,
            9.55475,
            0.055546 - 9.499e-9 * d,
            316.9670 + 0.0334442282 * d,
        )

    raise ValueError(f"Unsupported planet: {name}")


def _heliocentric_xyz(name: str, jd: float) -> Tuple[float, float, float]:
    """Approximate heliocentric ecliptic rectangular coordinates."""
    N, i, w, a, e, M = _orbital_elements(name, jd)
    E = _kepler_eccentric_anomaly(M, e)

    xv = a * (math.cos(E * RAD) - e)
    yv = a * math.sqrt(1.0 - e * e) * math.sin(E * RAD)

    v = math.atan2(yv, xv) * DEG
    r = math.sqrt(xv * xv + yv * yv)

    xh = r * (
        math.cos(N * RAD) * math.cos((v + w) * RAD)
        - math.sin(N * RAD) * math.sin((v + w) * RAD) * math.cos(i * RAD)
    )
    yh = r * (
        math.sin(N * RAD) * math.cos((v + w) * RAD)
        + math.cos(N * RAD) * math.sin((v + w) * RAD) * math.cos(i * RAD)
    )
    zh = r * math.sin((v + w) * RAD) * math.sin(i * RAD)

    return xh, yh, zh


def _sun_longitude(jd: float) -> float:
    """Approximate tropical geocentric longitude of the Sun."""
    x_sun, y_sun, _ = _heliocentric_xyz("Earth", jd)
    return _norm(math.atan2(y_sun, x_sun) * DEG)


def _planet_longitude(jd: float, name: str) -> float:
    """
    Approximate tropical geocentric longitude of a planet.

    The Earth element set above gives the Earth-to-Sun vector. For geocentric
    planet longitude, add that vector to the planet's heliocentric vector.
    """
    x_sun, y_sun, z_sun = _heliocentric_xyz("Earth", jd)
    xp, yp, zp = _heliocentric_xyz(name, jd)

    xg = xp + x_sun
    yg = yp + y_sun
    zg = zp + z_sun

    return _norm(math.atan2(yg, xg) * DEG)


# ── Moon ───────────────────────────────────────────────────────────────────────
def _moon_longitude(jd: float) -> float:
    """Approximate tropical ecliptic longitude of the Moon."""
    T = _T(jd)

    L_prime = 218.3164477 + 481267.88123421 * T - 0.0015786 * T**2 + T**3 / 538841 - T**4 / 65194000
    D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T**2 + T**3 / 545868 - T**4 / 113065000
    M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T**2 + T**3 / 24490000
    M_prime = 134.9633964 + 477198.8675055 * T + 0.0087414 * T**2 + T**3 / 69699 - T**4 / 14712000
    F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T**2 - T**3 / 3526000 + T**4 / 863310000

    E = 1.0 - 0.002516 * T - 0.0000074 * T**2

    # Main longitude terms from Meeus, in 1e-6 degrees.
    sigma_l = (
        6288774 * math.sin(M_prime * RAD)
        + 1274027 * math.sin((2 * D - M_prime) * RAD)
        + 658314 * math.sin((2 * D) * RAD)
        + 213618 * math.sin((2 * M_prime) * RAD)
        - 185116 * E * math.sin(M * RAD)
        - 114332 * math.sin((2 * F) * RAD)
        + 58793 * math.sin((2 * D - 2 * M_prime) * RAD)
        + 57066 * E * math.sin((2 * D - M - M_prime) * RAD)
        + 53322 * math.sin((2 * D + M_prime) * RAD)
        + 45758 * E * math.sin((2 * D - M) * RAD)
        - 40923 * E * math.sin((M - M_prime) * RAD)
        - 34720 * math.sin(D * RAD)
        - 30383 * E * math.sin((M + M_prime) * RAD)
        + 15327 * math.sin((2 * D - 2 * F) * RAD)
        - 12528 * math.sin((M_prime + 2 * F) * RAD)
        + 10980 * math.sin((M_prime - 2 * F) * RAD)
        + 10675 * math.sin((4 * D - M_prime) * RAD)
        + 10034 * math.sin((3 * M_prime) * RAD)
        + 8548 * math.sin((4 * D - 2 * M_prime) * RAD)
        - 7888 * E * math.sin((2 * D + M - M_prime) * RAD)
    )

    return _norm(L_prime + sigma_l / 1000000.0)


# ── Rahu / Ketu ────────────────────────────────────────────────────────────────
def _rahu_longitude(jd: float) -> float:
    """Approximate tropical longitude of the Moon's mean ascending node."""
    T = _T(jd)
    omega = 125.04452 - 1934.136261 * T + 0.0020708 * T**2 + T**3 / 450000
    return _norm(omega)


# ── Ascendant ──────────────────────────────────────────────────────────────────
def _local_sidereal_time(jd: float, longitude_deg: float) -> float:
    """Local sidereal time in degrees. East longitude is positive."""
    T = _T(jd)
    theta0 = (
        280.46061837
        + 360.98564736629 * (jd - J2000)
        + 0.000387933 * T**2
        - T**3 / 38710000
    )
    return _norm(theta0 + longitude_deg)


def _obliquity(jd: float) -> float:
    """Mean obliquity of the ecliptic in degrees."""
    T = _T(jd)
    return 23.4392911 - 0.013004167 * T - 0.0000001639 * T**2 + 0.0000005036 * T**3


def _ascendant(jd: float, latitude: float, longitude: float) -> float:
    """
    Approximate tropical Ascendant longitude.

    The raw horizon-intersection expression returns the opposite horizon point
    for this convention, so add 180 degrees to get the Ascendant rather than the
    Descendant.
    """
    lst = _local_sidereal_time(jd, longitude)
    eps = _obliquity(jd)

    lst_r = lst * RAD
    lat_r = latitude * RAD
    eps_r = eps * RAD

    y = -math.cos(lst_r)
    x = math.sin(lst_r) * math.cos(eps_r) + math.tan(lat_r) * math.sin(eps_r)

    descendant_lon = math.atan2(y, x) * DEG
    return _norm(descendant_lon + 180.0)


# ── Public calculator ──────────────────────────────────────────────────────────
def calculate_all(
    jd_ut: float,
    latitude: float,
    longitude: float,
    ayanamsha: Optional[float] = None,
) -> Dict[str, object]:
    """
    Calculate sidereal positions for Lagna + grahas.

    Args:
        jd_ut: Julian Day in UT.
        latitude: geographic latitude, degrees north positive.
        longitude: geographic longitude, degrees east positive.
        ayanamsha: sidereal offset in degrees. If None, approximate Lahiri is used.

    Returns:
        {
            "lagna_longitude": float,
            "positions": {
                "Sun": {"longitude": ..., "speed": ..., "retrograde": ...},
                ...
            },
            "ayanamsha_used": float,
        }
    """
    if ayanamsha is None:
        ayanamsha = lahiri_ayanamsha(jd_ut)

    def to_sidereal(tropical_lon: float) -> float:
        return _norm(tropical_lon - ayanamsha)

    tropical_funcs = {
        "Sun": _sun_longitude,
        "Moon": _moon_longitude,
        "Mars": lambda jd: _planet_longitude(jd, "Mars"),
        "Mercury": lambda jd: _planet_longitude(jd, "Mercury"),
        "Jupiter": lambda jd: _planet_longitude(jd, "Jupiter"),
        "Venus": lambda jd: _planet_longitude(jd, "Venus"),
        "Saturn": lambda jd: _planet_longitude(jd, "Saturn"),
    }

    positions: Dict[str, Dict[str, object]] = {}

    for name, fn in tropical_funcs.items():
        lon_trop = fn(jd_ut)
        lon_sid = to_sidereal(lon_trop)

        # Approximate instantaneous speed using a 1-day finite difference.
        lon_trop_plus = fn(jd_ut + 1.0)
        lon_sid_plus = to_sidereal(lon_trop_plus)
        speed = _angle_delta(lon_sid_plus, lon_sid)

        positions[name] = {
            "longitude": lon_sid,
            "latitude": 0.0,
            "distance": 1.0,
            "speed": round(speed, 6),
            "retrograde": speed < 0.0,
        }

    # Rahu / Ketu: mean node, normally retrograde.
    rahu_trop = _rahu_longitude(jd_ut)
    rahu_sid = to_sidereal(rahu_trop)
    ketu_sid = _norm(rahu_sid + 180.0)

    positions["Rahu"] = {
        "longitude": rahu_sid,
        "latitude": 0.0,
        "distance": 0.0,
        "speed": -0.053,
        "retrograde": True,
    }
    positions["Ketu"] = {
        "longitude": ketu_sid,
        "latitude": 0.0,
        "distance": 0.0,
        "speed": -0.053,
        "retrograde": True,
    }

    asc_trop = _ascendant(jd_ut, latitude, longitude)
    lagna_sidereal = to_sidereal(asc_trop)

    return {
        "lagna_longitude": lagna_sidereal,
        "positions": positions,
        "ayanamsha_used": round(ayanamsha, 6),
    }