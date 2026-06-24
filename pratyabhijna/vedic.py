"""
vedic.py - Core Vedic astrology utility functions.
Sign, Nakshatra, Pada, House, and label computations.
"""

SIGN_ORDER = [
    "Aries", "Taurus", "Gemini", "Cancer",
    "Leo", "Virgo", "Libra", "Scorpio",
    "Sagittarius", "Capricorn", "Aquarius", "Pisces"
]

SANSKRIT_SIGNS = {
    "Aries": "Meṣa",
    "Taurus": "Vṛṣabha",
    "Gemini": "Mithuna",
    "Cancer": "Karka",
    "Leo": "Siṃha",
    "Virgo": "Kanyā",
    "Libra": "Tulā",
    "Scorpio": "Vṛścika",
    "Sagittarius": "Dhanu",
    "Capricorn": "Makara",
    "Aquarius": "Kumbha",
    "Pisces": "Mīna"
}

NAKSHATRAS = [
    ("Aśvinī",           "Ketu"),
    ("Bharaṇī",          "Venus"),
    ("Kṛttikā",          "Sun"),
    ("Rohiṇī",           "Moon"),
    ("Mṛgaśīrṣa",       "Mars"),
    ("Ārdrā",            "Rahu"),
    ("Punarvasu",        "Jupiter"),
    ("Puṣya",            "Saturn"),
    ("Āśleṣā",           "Mercury"),
    ("Maghā",            "Ketu"),
    ("Pūrva Phalgunī",   "Venus"),
    ("Uttara Phalgunī",  "Sun"),
    ("Hasta",            "Moon"),
    ("Citrā",            "Mars"),
    ("Svātī",            "Rahu"),
    ("Viśākhā",          "Jupiter"),
    ("Anurādhā",         "Saturn"),
    ("Jyeṣṭhā",          "Mercury"),
    ("Mūla",             "Ketu"),
    ("Pūrva Āṣāḍhā",    "Venus"),
    ("Uttara Āṣāḍhā",   "Sun"),
    ("Śravaṇa",          "Moon"),
    ("Dhaniṣṭhā",        "Mars"),
    ("Śatabhiṣaj",       "Rahu"),
    ("Pūrva Bhādrapadā", "Jupiter"),
    ("Uttara Bhādrapadā","Saturn"),
    ("Revatī",           "Mercury"),
]

NAKSHATRA_SIZE = 360.0 / 27.0  # 13.333...°
PADA_SIZE = NAKSHATRA_SIZE / 4.0

GRAHA_GLYPHS = {
    "Lagna":   "▲",
    "Sun":     "☉",
    "Moon":    "☾",
    "Mars":    "♂",
    "Mercury": "☿",
    "Jupiter": "♃",
    "Venus":   "♀",
    "Saturn":  "♄",
    "Rahu":    "☊",
    "Ketu":    "☋",
}

GRAHA_COLORS = {
    "Lagna":   {"color": "#00FFCC", "glow": "rgba(0, 255, 204, 0.6)"},
    "Sun":     {"color": "#FF9933", "glow": "rgba(255, 153, 51, 0.6)"},
    "Moon":    {"color": "#E6F2FF", "glow": "rgba(230, 242, 255, 0.6)"},
    "Mars":    {"color": "#FF4D4D", "glow": "rgba(255, 77, 77, 0.6)"},
    "Mercury": {"color": "#2EC4B6", "glow": "rgba(46, 196, 182, 0.6)"},
    "Jupiter": {"color": "#FFD700", "glow": "rgba(255, 215, 0, 0.6)"},
    "Venus":   {"color": "#E040FB", "glow": "rgba(224, 64, 251, 0.6)"},
    "Saturn":  {"color": "#7986CB", "glow": "rgba(121, 134, 203, 0.6)"},
    "Rahu":    {"color": "#9C27B0", "glow": "rgba(156, 39, 176, 0.6)"},
    "Ketu":    {"color": "#FF2A85", "glow": "rgba(255, 42, 133, 0.6)"},
}

GRAHA_ROLES = {
    "Lagna":   "Ascendant / self-axis",
    "Sun":     "Soul / vitality",
    "Moon":    "Mind / emotional field",
    "Mars":    "Drive / courage / conflicts",
    "Mercury": "Intellect / communication",
    "Jupiter": "Wisdom / dharma / expansion",
    "Venus":   "Beauty / refinement / relationships",
    "Saturn":  "Discipline / karma / structure",
    "Rahu":    "North Node / worldly desire",
    "Ketu":    "South Node / spiritual release",
}


def longitude_to_sign(longitude: float) -> str:
    """Return the zodiac sign name for a sidereal longitude."""
    longitude = longitude % 360.0
    return SIGN_ORDER[int(longitude // 30)]


def longitude_to_sign_index(longitude: float) -> int:
    """Return the 0-based index of the zodiac sign."""
    return int((longitude % 360.0) // 30)


def longitude_to_sign_degree(longitude: float) -> float:
    """Return degrees within the sign (0–30)."""
    return longitude % 30.0


def longitude_to_nakshatra(longitude: float) -> dict:
    """Return nakshatra name, lord, pada, and offset within nakshatra."""
    lon = longitude % 360.0
    idx = int(lon // NAKSHATRA_SIZE)
    idx = min(idx, 26)
    offset = lon - (idx * NAKSHATRA_SIZE)
    pada = int(offset // PADA_SIZE) + 1
    pada = min(pada, 4)
    name, lord = NAKSHATRAS[idx]
    return {
        "nakshatra": name,
        "nakshatra_lord": lord,
        "pada": pada,
        "nakshatra_index": idx,
        "offset_in_nakshatra": offset
    }


def whole_sign_house(planet_sign_index: int, lagna_sign_index: int) -> int:
    """Calculate whole-sign house number (1-12)."""
    return ((planet_sign_index - lagna_sign_index) % 12) + 1


def format_degree(degree: float) -> str:
    """Format a fractional degree as degrees and minutes: e.g. 8°07′"""
    d = int(degree)
    m = int((degree - d) * 60)
    return f"{d}°{m:02d}′"


def build_placement(
    name: str,
    longitude: float,
    lagna_sign_index: int,
    retrograde: bool = False,
    speed: float = 0.0,
    interpretation: str = ""
) -> dict:
    """
    Build a complete placement dict from raw sidereal longitude.
    """
    longitude = longitude % 360.0
    sign = longitude_to_sign(longitude)
    sign_index = longitude_to_sign_index(longitude)
    sign_degree = longitude_to_sign_degree(longitude)
    nak = longitude_to_nakshatra(longitude)
    house = whole_sign_house(sign_index, lagna_sign_index)
    colors = GRAHA_COLORS.get(name, {"color": "#FFFFFF", "glow": "rgba(255,255,255,0.4)"})

    return {
        "name": name,
        "glyph": GRAHA_GLYPHS.get(name, "★"),
        "longitude": round(longitude, 4),
        "sign": sign,
        "rashi": SANSKRIT_SIGNS.get(sign, sign),
        "sign_degree": round(sign_degree, 4),
        "degree_label": format_degree(sign_degree),
        "house": house,
        "retrograde": retrograde,
        "speed": round(speed, 6),
        "role": GRAHA_ROLES.get(name, ""),
        "color": colors["color"],
        "glow": colors["glow"],
        "interpretation": interpretation,
        **nak,
    }
