"""
time_utils.py - Time and timezone utilities for chart calculations.
Converts local birth time → UTC → Julian Day (UT).

Windows note: ZoneInfo requires the 'tzdata' package on Windows.
This module handles that transparently.
"""
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# ── Timezone handling (ZoneInfo + tzdata, or pytz fallback) ──────────────────
_tz_backend = None

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    # Test if tzdata is available
    ZoneInfo("UTC")
    _tz_backend = 'zoneinfo'
    logger.info("Using zoneinfo backend for timezone handling.")
except Exception:
    try:
        import pytz
        _tz_backend = 'pytz'
        logger.info("Using pytz backend for timezone handling.")
    except ImportError:
        _tz_backend = 'utc_only'
        logger.warning("No timezone backend available. All times will be treated as UTC.")


def _get_tz(tz_name: str):
    """Return a timezone object from a timezone name string."""
    if _tz_backend == 'zoneinfo':
        try:
            return ZoneInfo(tz_name)
        except Exception:
            return ZoneInfo("UTC")
    elif _tz_backend == 'pytz':
        try:
            return pytz.timezone(tz_name)
        except Exception:
            return pytz.UTC
    else:
        return timezone.utc


def _localize(dt: datetime, tz) -> datetime:
    """Attach timezone to a naive datetime."""
    if _tz_backend == 'zoneinfo':
        return dt.replace(tzinfo=tz)
    elif _tz_backend == 'pytz':
        return tz.localize(dt)
    else:
        return dt.replace(tzinfo=timezone.utc)


def _to_utc(dt_localized: datetime) -> datetime:
    """Convert localized datetime to UTC."""
    if _tz_backend == 'zoneinfo':
        from zoneinfo import ZoneInfo
        return dt_localized.astimezone(ZoneInfo("UTC"))
    elif _tz_backend == 'pytz':
        import pytz
        return dt_localized.astimezone(pytz.UTC)
    else:
        return dt_localized.astimezone(timezone.utc)


# ── Julian Day calculation ────────────────────────────────────────────────────

def _julday_python(year: int, month: int, day: int, hour_decimal: float) -> float:
    """
    Pure-Python Julian Day calculation using the Meeus algorithm.

    IMPORTANT:
    hour_decimal is UT hours, not days.

    Example:
        03:20 UTC -> hour_decimal = 3 + 20/60 = 3.333333

    Therefore it must be divided by 24 before adding to the Julian Day.
    """
    if month <= 2:
        year -= 1
        month += 12

    A = int(year / 100)
    B = 2 - A + int(A / 4)

    return (
        int(365.25 * (year + 4716))
        + int(30.6001 * (month + 1))
        + day
        + (hour_decimal / 24.0)
        + B
        - 1524.5
    )


def julday(year: int, month: int, day: int, hour_decimal: float) -> float:
    """
    Calculate Julian Day UT.

    hour_decimal is UT hours, e.g. 03:20 = 3.333333.
    """
    try:
        import swisseph as swe

        # Explicit Gregorian calendar. This is safer and clearer for CI/CD.
        try:
            return swe.julday(year, month, day, hour_decimal, swe.GREG_CAL)
        except TypeError:
            # Compatibility fallback for older pyswisseph signatures.
            return swe.julday(year, month, day, hour_decimal)

    except ImportError:
        return _julday_python(year, month, day, hour_decimal)


# ── Timezone resolution ───────────────────────────────────────────────────────

def resolve_timezone(latitude: float, longitude: float) -> str:
    """Resolve timezone name from lat/lon. Returns IANA timezone string."""
    try:
        from timezonefinder import TimezoneFinder
        tf = TimezoneFinder()
        tz_name = tf.timezone_at(lat=latitude, lng=longitude)
        if tz_name:
            logger.info(f"Timezone resolved: {tz_name} for ({latitude:.4f}, {longitude:.4f})")
            return tz_name
    except Exception as e:
        logger.error(f"TimezoneFinder error: {e}")

    # Manual UTC offset fallback based on longitude
    offset_hours = round(longitude / 15.0)
    logger.warning(f"Falling back to UTC+{offset_hours} offset for lon={longitude}")
    return f"Etc/GMT{-offset_hours:+d}" if offset_hours != 0 else "UTC"


# ── Main conversion ───────────────────────────────────────────────────────────

def convert_to_utc_and_julian(date_str: str, time_str: str, tz_name: str) -> dict:
    """
    Convert local birth date+time to UTC and Julian Day UT.

    Args:
        date_str: "YYYY-MM-DD"
        time_str: "HH:MM" (24-hour)
        tz_name:  IANA timezone string, e.g. "Asia/Kathmandu"

    Returns:
        dict: {local, utc, julian_day_ut}
    """
    dt_naive = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")

    try:
        tz = _get_tz(tz_name)
        dt_localized = _localize(dt_naive, tz)
        dt_utc = _to_utc(dt_localized)
    except Exception as e:
        logger.error(f"Timezone conversion error for '{tz_name}': {e}. Using UTC.")
        dt_localized = dt_naive.replace(tzinfo=timezone.utc)
        dt_utc = dt_localized

    hour_decimal = dt_utc.hour + dt_utc.minute / 60.0 + dt_utc.second / 3600.0
    jd_ut = julday(dt_utc.year, dt_utc.month, dt_utc.day, hour_decimal)

    return {
        "local": dt_localized.isoformat(),
        "utc": dt_utc.isoformat(),
        "julian_day_ut": jd_ut,
    }
