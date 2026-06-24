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
    ("Aśvinī", "Ketu"),
    ("Bharaṇī", "Venus"),
    ("Kṛttikā", "Sun"),
    ("Rohiṇī", "Moon"),
    ("Mṛgaśīrṣa", "Mars"),
    ("Ārdrā", "Rahu"),
    ("Punarvasu", "Jupiter"),
    ("Puṣya", "Saturn"),
    ("Āśleṣā", "Mercury"),
    ("Maghā", "Ketu"),
    ("Pūrva Phalgunī", "Venus"),
    ("Uttara Phalgunī", "Sun"),
    ("Hasta", "Moon"),
    ("Citrā", "Mars"),
    ("Svātī", "Rahu"),
    ("Viśākhā", "Jupiter"),
    ("Anurādhā", "Saturn"),
    ("Jyeṣṭhā", "Mercury"),
    ("Mūla", "Ketu"),
    ("Pūrva Āṣāḍhā", "Venus"),
    ("Uttara Āṣāḍhā", "Sun"),
    ("Śravaṇa", "Moon"),
    ("Dhaniṣṭhā", "Mars"),
    ("Śatabhiṣaj", "Rahu"),
    ("Pūrva Bhādrapadā", "Jupiter"),
    ("Uttara Bhādrapadā", "Saturn"),
    ("Revatī", "Mercury")
]


def absolute_longitude(sign: str, degree: float) -> float:
    return SIGN_ORDER.index(sign) * 30 + degree


def compute_nakshatra(abs_lon: float) -> dict:
    nak_size = 360.0 / 27.0
    pada_size = nak_size / 4.0

    # Ensure longitude sits within 0-360 range
    abs_lon = abs_lon % 360.0

    idx = int(abs_lon // nak_size)
    offset = abs_lon - (idx * nak_size)
    pada = int(offset // pada_size) + 1

    name, lord = NAKSHATRAS[idx]

    return {
        "nakshatra": name,
        "nakshatra_lord": lord,
        "pada": pada,
        "offset_in_nakshatra": offset
    }


def enrich_placement(placement: dict) -> dict:
    lon = absolute_longitude(placement["sign"], placement["degree"])
    nak = compute_nakshatra(lon)

    # Make sure we don't crash if we have some other planets later
    from pratyabhijna.interpretations import INTERPRETATIONS
    interpretation = INTERPRETATIONS.get(placement["name"], "No description available.")

    return {
        **placement,
        "absolute_longitude": lon,
        "rashi": SANSKRIT_SIGNS[placement["sign"]],
        "interpretation": interpretation,
        **nak
    }
