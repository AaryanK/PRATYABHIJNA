"""
app.py - Pratyabhijna Flask application.
Serves the immersive UI and provides all API endpoints.
"""
import os
import logging
from datetime import date
from flask import Flask, jsonify, render_template, request

from pratyabhijna.data import D1_PLACEMENTS
from pratyabhijna.jyotisha import enrich_placement

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ── Lazy-load heavy modules to avoid startup errors if optional deps missing ──

def _get_geocoder():
    from pratyabhijna.geocode import geocode_place
    return geocode_place


def _get_time_utils():
    from pratyabhijna.time_utils import resolve_timezone, convert_to_utc_and_julian
    return resolve_timezone, convert_to_utc_and_julian


def _get_ephemeris():
    from pratyabhijna.ephemeris import build_full_chart
    return build_full_chart


def _get_aspects():
    from pratyabhijna.aspects import compute_aspects
    return compute_aspects


def _get_dasha():
    from pratyabhijna.dasha import compute_dasha
    return compute_dasha


# ── Helper: enriched dummy data (used as fallback) ───────────────────────────

def _dummy_placements():
    return [enrich_placement(p) for p in D1_PLACEMENTS]


# ════════════════════════════════════════════════════════════════════════════════
#  ROUTES
# ════════════════════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    """Renders the main immersive UI."""
    cesium_token = os.environ.get("CESIUM_ION_TOKEN", "")
    return render_template("index.html", cesium_token=cesium_token)


@app.route("/api/chart/dummy", methods=["GET"])
def get_dummy_chart():
    """Returns the enriched D1 static dummy data."""
    try:
        enriched = _dummy_placements()
        return jsonify({"placements": enriched})
    except Exception as e:
        app.logger.error(f"Error enriching dummy chart: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/chart/calculate", methods=["POST"])
def calculate_chart():
    """
    Real D1 chart calculation.
    Accepts JSON: {dob, tob, pob, [ayanamsha]}
    Returns JSON: {status, placements, aspects, metadata}
    """
    data = request.json or {}
    dob = (data.get("dob") or "").strip()
    tob = (data.get("tob") or "").strip()
    pob = (data.get("pob") or "").strip()
    ayanamsha = (data.get("ayanamsha") or "LAHIRI").strip().upper()

    app.logger.info(f"Chart calculate: DOB={dob}, TOB={tob}, POB={pob}, Ayanamsha={ayanamsha}")

    # ── Validate inputs ───────────────────────────────────────────────────────
    if not dob or not tob or not pob:
        return jsonify({
            "status": "error",
            "error": "Missing required fields: dob, tob, pob"
        }), 400

    try:
        birth_date = date.fromisoformat(dob)
    except ValueError:
        return jsonify({"status": "error", "error": "Invalid dob format. Use YYYY-MM-DD"}), 400

    # ── Geocode place of birth ────────────────────────────────────────────────
    geocode_place = _get_geocoder()
    geo = geocode_place(pob)
    if geo is None:
        app.logger.warning(f"Geocoding failed for '{pob}', falling back to dummy data.")
        enriched = _dummy_placements()
        return jsonify({
            "status": "fallback",
            "message": f"Could not geocode '{pob}'. Showing approximate chart.",
            "placements": enriched,
            "aspects": _calc_aspects(enriched),
            "metadata": {"dob": dob, "tob": tob, "pob": pob, "ayanamsha": ayanamsha},
        })

    lat = geo["latitude"]
    lon_geo = geo["longitude"]
    app.logger.info(f"Geocoded: {geo['place']} → ({lat}, {lon_geo})")

    # ── Resolve timezone ──────────────────────────────────────────────────────
    resolve_timezone, convert_to_utc_and_julian = _get_time_utils()
    tz_str = resolve_timezone(lat, lon_geo)
    app.logger.info(f"Timezone: {tz_str}")

    try:
        time_data = convert_to_utc_and_julian(dob, tob, tz_str)
    except Exception as e:
        app.logger.error(f"Time conversion error: {e}")
        return jsonify({"status": "error", "error": f"Time conversion failed: {e}"}), 500

    jd_ut = time_data["julian_day_ut"]
    app.logger.info(f"Julian Day UT: {jd_ut}")

    # ── Parse birth datetime for kerykeion ───────────────────────────────────
    try:
        from datetime import datetime
        dt_local = datetime.fromisoformat(time_data["local"])
        year, month, day = dt_local.year, dt_local.month, dt_local.day
        hour, minute = dt_local.hour, dt_local.minute
    except Exception as e:
        app.logger.error(f"Datetime parse error: {e}")
        return jsonify({"status": "error", "error": str(e)}), 500

    # ── Calculate chart ───────────────────────────────────────────────────────
    try:
        build_full_chart = _get_ephemeris()
        placements = build_full_chart(
            year=year, month=month, day=day,
            hour=hour, minute=minute,
            lat=lat, lon_geo=lon_geo,
            tz_str=tz_str,
            jd_ut=jd_ut,
            ayanamsha=ayanamsha,
        )
        app.logger.info(f"Chart calculated: {len(placements)} placements.")
    except Exception as e:
        app.logger.error(f"Ephemeris calculation failed: {e}")
        # Graceful fallback to dummy data
        enriched = _dummy_placements()
        return jsonify({
            "status": "fallback",
            "message": f"Calculation engine error: {e}. Showing reference chart.",
            "placements": enriched,
            "aspects": _calc_aspects(enriched),
            "metadata": {
                "dob": dob, "tob": tob, "pob": pob,
                "ayanamsha": ayanamsha,
                "lat": lat, "lon": lon_geo, "tz": tz_str,
                "jd_ut": jd_ut,
            },
        })

    # ── Compute aspects ───────────────────────────────────────────────────────
    aspects = _calc_aspects(placements)

    # ── Compute Dasha ─────────────────────────────────────────────────────────
    dasha_data = _calc_dasha(placements, dob)

    return jsonify({
        "status": "success",
        "message": "Chart calculated successfully using sidereal coordinates.",
        "placements": placements,
        "aspects": aspects,
        "dasha": dasha_data,
        "metadata": {
            "dob": dob,
            "tob": tob,
            "pob": pob,
            "place_resolved": geo["place"],
            "lat": lat,
            "lon": lon_geo,
            "tz": tz_str,
            "local": time_data["local"],
            "utc": time_data["utc"],
            "julian_day_ut": jd_ut,
            "ayanamsha": ayanamsha,
        },
    })


def _calc_aspects(placements: list) -> list:
    """Compute aspects from placements; return empty list on error."""
    try:
        compute_aspects = _get_aspects()
        return compute_aspects(placements)
    except Exception as e:
        app.logger.error(f"Aspect computation error: {e}")
        return []


def _calc_dasha(placements: list, dob: str) -> dict | None:
    """Compute Vimshottari Dasha; return None on error."""
    try:
        moon = next((p for p in placements if p["name"] == "Moon"), None)
        if moon is None:
            return None
        compute_dasha = _get_dasha()
        return compute_dasha(
            moon_longitude=moon["longitude"],
            birth_date_str=dob,
        )
    except Exception as e:
        app.logger.error(f"Dasha computation error: {e}")
        return None


# ════════════════════════════════════════════════════════════════════════════════
#  ORACLE ENDPOINT
# ════════════════════════════════════════════════════════════════════════════════

@app.route("/api/oracle", methods=["POST"])
def oracle_query():
    """Keyword-based oracle responding with focus targets and visual modes."""
    data = request.json or {}
    query = data.get("query", "").strip().lower()
    # Optional: placements from current chart for dynamic context
    placements = data.get("placements", [])
    app.logger.info(f"Oracle received query: {query}")

    response_data = {
        "query": query,
        "focus_target": None,
        "mode": None,
        "message": "",
    }

    # Dynamic oracle: if placements provided, extract real chart context
    if placements:
        planet_context = {p['name']: p for p in placements if p.get('name')}
    else:
        planet_context = {}

    def _planet_desc(name: str, default: str) -> str:
        p = planet_context.get(name)
        if p:
            retro = " (retrograde)" if p.get("retrograde") else ""
            return (f"{name} is in {p.get('sign', '?')} in house {p.get('house', '?')}"
                    f" ({p.get('nakshatra', '')} nakshatra){retro}. {p.get('interpretation', '')}")
        return default

    if "moon" in query:
        response_data["focus_target"] = "Moon"
        response_data["mode"] = "rashi"
        response_data["message"] = _planet_desc(
            "Moon",
            "Chandra (Moon) connects the mind to emotions, mother, and the flow of dharma."
        )
    elif "saturn" in query or "shani" in query:
        response_data["focus_target"] = "Saturn"
        response_data["mode"] = "rashi"
        response_data["message"] = _planet_desc(
            "Saturn",
            "Shani (Saturn) imposes structured discipline and karmic responsibility."
        )
    elif "sun" in query or "surya" in query:
        response_data["focus_target"] = "Sun"
        response_data["mode"] = "rashi"
        response_data["message"] = _planet_desc(
            "Sun",
            "Surya (Sun) represents the soul, authority, and vital core."
        )
    elif "mars" in query or "mangal" in query or "kuja" in query:
        response_data["focus_target"] = "Mars"
        response_data["mode"] = "rashi"
        response_data["message"] = _planet_desc(
            "Mars",
            "Mangal (Mars) channels courage, competitive drive, and direct action."
        )
    elif "mercury" in query or "budha" in query:
        response_data["focus_target"] = "Mercury"
        response_data["mode"] = "rashi"
        response_data["message"] = _planet_desc(
            "Mercury",
            "Budha (Mercury) governs intellect, speech, analysis, and commerce."
        )
    elif "jupiter" in query or "guru" in query or "brihaspati" in query:
        response_data["focus_target"] = "Jupiter"
        response_data["mode"] = "rashi"
        response_data["message"] = _planet_desc(
            "Jupiter",
            "Guru (Jupiter) expands wisdom, dharma, and spiritual knowledge."
        )
    elif "venus" in query or "shukra" in query:
        response_data["focus_target"] = "Venus"
        response_data["mode"] = "rashi"
        response_data["message"] = _planet_desc(
            "Venus",
            "Shukra (Venus) governs beauty, relationships, art, and desire."
        )
    elif "rahu" in query:
        response_data["focus_target"] = "Rahu"
        response_data["mode"] = "rahu-ketu"
        response_data["message"] = _planet_desc(
            "Rahu",
            "Rahu amplifies worldly desire, illusion, and karmic obsession."
        )
    elif "ketu" in query:
        response_data["focus_target"] = "Ketu"
        response_data["mode"] = "rahu-ketu"
        response_data["message"] = _planet_desc(
            "Ketu",
            "Ketu signifies spiritual release, detachment, and past-life mastery."
        )
    elif "lagna" in query or "ascendant" in query:
        response_data["focus_target"] = "Lagna"
        response_data["mode"] = "rashi"
        response_data["message"] = _planet_desc(
            "Lagna",
            "The Lagna (Ascendant) is the observer-center, the seed of the chart."
        )
    elif "12th" in query or "twelfth" in query:
        response_data["focus_target"] = "12th"
        response_data["mode"] = "rashi"
        response_data["message"] = (
            "The 12th House channels vital energy toward solitude, spiritual retreat, "
            "foreign realms, and unseen support."
        )
    elif "nakshatra" in query:
        response_data["mode"] = "nakshatra"
        response_data["message"] = (
            "Revealing the Nakshatra Maṇḍala — the 27 lunar mansions "
            "through which the planetary nodes weave their cosmic patterns."
        )
    elif "aspect" in query or "dristi" in query or "drishti" in query:
        response_data["mode"] = "aspect"
        response_data["message"] = (
            "Displaying planetary dṛṣṭi — the living streams of force "
            "cast between grahas and the houses they illuminate."
        )
    elif any(kw in query for kw in ["dasha", "gochar", "transit", "period"]):
        response_data["mode"] = "dasha"
        response_data["message"] = (
            "Opening the Vimśottarī Dasha timeline — the unfolding of planetary periods "
            "from your birth nakshatra through the cosmic cycle."
        )
    elif "table" in query:
        response_data["mode"] = "table"
        response_data["message"] = (
            "Displaying the D1 placement table — exact degrees, signs, "
            "Nakshatras, Padas, and lords."
        )
    else:
        response_data["message"] = (
            "The cosmic winds whisper through the rāśis. Ask me about Moon, Saturn, Rahu, Ketu, "
            "Sun, Mars, Mercury, Jupiter, Venus, Lagna, or the 12th house. "
            "Say 'show nakshatras', 'aspects', 'dasha', or 'table' to guide the mandala."
        )

    return jsonify(response_data)


# ════════════════════════════════════════════════════════════════════════════════
#  TRANSITS ENDPOINT (Phase 4 stub)
# ════════════════════════════════════════════════════════════════════════════════

@app.route("/api/transits", methods=["POST"])
def get_transits():
    """
    Returns current planetary positions for transit/gochar overlay.
    POST body: {natal_placements: [...]}  (optional, for aspect calculation)
    """
    from datetime import datetime
    now = datetime.utcnow()
    try:
        build_full_chart = _get_ephemeris()
        # Use UTC now; lat/lon 0/0 (tropical reference, geocentric), tz=UTC
        transits = build_full_chart(
            year=now.year, month=now.month, day=now.day,
            hour=now.hour, minute=now.minute,
            lat=0.0, lon_geo=0.0,
            tz_str="UTC",
            ayanamsha="LAHIRI",
        )
        return jsonify({"status": "success", "transits": transits, "as_of": now.isoformat()})
    except Exception as e:
        app.logger.error(f"Transit calculation failed: {e}")
        return jsonify({"status": "error", "error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
