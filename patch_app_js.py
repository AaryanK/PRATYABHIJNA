from pathlib import Path
import re

path = Path("static\\js\\app.js")
if not path.exists():
    raise SystemExit("ERROR: app.js not found in current folder.")

src = path.read_text(encoding="utf-8")
backup = Path("app.js.bak")
backup.write_text(src, encoding="utf-8")

# ---------------------------------------------------------------------
# 1. Replace real API placement loading with normalized loading
# ---------------------------------------------------------------------
old_real = """            state.placement = data.placements || [];
            // Use backend-computed aspects if available, fallback to hardcoded
            if (data.aspects && data.aspects.length > 0) {
                window.HARD_CODED_ASPECTS = data.aspects;
                console.log(`Loaded ${data.aspects.length} computed aspects from backend.`);
            }"""

new_real = """            const normalized = normalizeChartResponse(data);
            state.placements = normalized.placements;

            // Use backend-computed aspects f available, fallback to hardcoded
            if (normalized.aspects && normalized.aspects.length > 0) {
                window.HARD_CODED_ASPECTS = normalized.aspects;
                console.log(`Loaded ${normalized.aspects.length} computed aspects from backend.`);
            }

            console.table(state.placements.map(p => ({
                name: p.name,
                lon: p.absolute_longitude,
                sign: p.sign,
                house: p.house,
                nak: p.nakshatra,
               pada: p.pada
            })));"""

if old_real in src:
    src = src.replace(old_real, new_real, 1)
else:
    print("WARN: real API fetch block not found or already patched.")

# ---------------------------------------------------------------------
# 2. Replace dummy fallback placement loading
# ---------------------------------------------------------------------
old_dummy = """                    state.placements = data.placements || [];
                    return data;"""

new_dummy = """                    const normalized = normalizeChartResponse(data);
                    state.placements = normalized.placements;

                    if (normalized.aspects && normalized.aspects.length > 0) {
                        window.HARD_CODED_ASPECTS = normalized.aspects;
                    }

                    return data;"""

if old_dummy in src:
    src = src.replace(old_dummy, new_dummy, 1)
else:
    print("WARN: dummy fallback block not found or already patched.")

# --------------------------------------------------------------------
# 3. Insert normalization helpers after GRAHA_COLORS
# ---------------------------------------------------------------------
normalizer = r'''
    // --- Backend Response Normalization ---
    // The real Flask API returns "longitude" and snake_case aspect keys.
    // The visual engine expects "absolute_longitude" and camelCase aspect keys.
    // Normalize once after every fetch so the rest of the UI can stay simple.

    const GRAHA_GLYPHS = {
       "Lagna": "▲",
        "Sun": "☉",
        "Moon": "☾",
        "Mars": "♂",
        "Mercury": "☿",
        "Jupiter": "♃",
        "Venus": "♀",
        "Saturn": "♄",
        "Rahu": "☊",
        "Ketu": "☋"
    };

    function normalizeLongitude(value, fallback = 0) {
        const n = Number(value);
        const f = Number(fallback);
        const v = Number.isFinite(n) ? n : (Number.isFinite(f) ? f : 0);
        return ((v % 360) + 360) % 360;
    }

    function normalizePlacement(g) {
        i (!g || typeof g !== "object") return null;

        const name = g.name || g.graha || g.planet || "Unknown";
        const style = GRAHA_COLORS[name] || GRAHA_COLORS["Lagna"];

        const lon = normalizeLongitude(
            g.absolute_longitude ??
            g.longitude ??
            g.sidereal_longitude ??
            g.lon ??
            g.degree ??
            g.sign_degree
        );

        const houseNum = Number.parseInt(g.house ?? g.house_number ?? 1, 10);
        const signDegree = Numer(g.sign_degree ?? g.degree ?? (lon % 30));

        return {
            ...g,
            name,
            absolute_longitude: lon,
            longitude: lon,
            degree: Number.isFinite(signDegree) ? Number(signDegree.toFixed(4)) : Number((lon % 30).toFixed(4)),
            glyph: g.glyph || GRAHA_GLYPHS[name] || "•",
            color: g.color || style.color,
            glow: g.glow || style.glow,
            house: Number.isFinite(houseNum) ? houseNum : 1,
            sign: g.sign || g.rshi_english || g.rashi || "Unknown",
            rashi: g.rashi || g.sign || "Unknown",
            nakshatra: g.nakshatra || "Unknown",
            pada: g.pada ?? "?",
            retrograde: Boolean(g.retrograde),
            speed: Number(g.speed || 0),
            interpretation: g.interpretation || "",
            role: g.role || ""
        };
    }

    function normalizeAspect(a) {
        if (!a || typeof a !== "object") return null;

        const from = a.from ?? a.fromGraha ?? a.source ?? a.ource_graha ?? "";
        const to = a.to ?? a.toGraha ?? a.target ?? null;

        const aspectKind = String(
            a.aspectKind ??
            a.aspect_kind ??
            a.aspect_type ??
            a.kind ??
            ""
        );

        const targetHouseRaw =
            a.targetHouse ??
            a.target_house ??
            a.receiving_house ??
            a.house ??
            null;

        const targetHouseNum = Number.parseInt(targetHouseRaw, 10);

        const targetSign =
           a.targetSign ??
            a.target_sign ??
            a.receiving_sign ??
            a.sign ??
            "";

        const aspectNumberRaw =
            a.aspectNumber ??
            a.aspect_number ??
            null;

        const aspectNumber = Number.parseInt(aspectNumberRaw, 10);

        const id = (
            a.id ||
            `${from}_${Number.isFinite(aspectNumber) ? aspectNumber : aspectKind}_${targetHouseRaw || to || targetSign}`
        )
            .toString()
           .replace(/\s+/g, "_")
            .replace(/-/g, "_")
            .toLowerCase();

        return {
            ...a,
            id,
            from,
            fromGraha: a.fromGraha ?? from,
            source: a.source ?? from,
            to,
            toGraha: a.toGraha ?? to,
            aspectKind,
            aspectNumber: Number.isFinite(aspectNumber) ? aspectNumber : a.aspectNumber,
            targetHouse: Number.isFinite(targetHouseNum) ? targetHouseNum : null,
            targetSin,
            targetType: a.targetType ?? a.target_type ?? (to && !String(to).startsWith("H") ? "graha" : "house"),
            color: a.color || (GRAHA_COLORS[from]?.color) || "#f4c978",
            label: a.label || `${from} ${aspectKind} → ${targetSign || to || "target"}`,
            description: a.description || "",
            strength: Number(a.strength ?? 1.0),
            importance: a.importance || "major",
            receiving_grahas: a.receiving_grahas || a.receivingGrahas || []
        };    }

    function normalizeChartResponse(data) {
        const rawPlacements =
            data?.placements ||
            data?.chart?.placements ||
            data?.data?.placements ||
            [];

        const placements = rawPlacements
            .map(normalizePlacement)
            .filter(Boolean);

        const rawAspects =
            data?.aspects ||
            data?.chart?.aspects ||
            data?.data?.aspects ||
            [];

        const aspects = rawAspects
            .mp(normalizeAspect)
            .filter(Boolean);

        return { placements, aspects };
    }

    function getLagnaSignIndex() {
        const lagna = state.placements.find(p => p.name === "Lagna");

        if (lagna) {
            const bySign = SIGN_ORDER.findIndex(s => s.toLowerCase() === String(lagna.sign || "").toLowerCase());
            if (bySign !== -1) return bySign;

            const byLongitude = Math.floor(normalizeLongitude(lagna.absolute_longitude) / 30);
            if (Number.isFinte(byLongitude)) return byLongitude;
        }

        // Safe fallback keeps the original Scorpio-Lagna demo behavior.
        return 7;
    }

    function houseForSignIndex(signIndex) {
        const lagnaIndex = getLagnaSignIndex();
        return ((Number(signIndex) - lagnaIndex + 12) % 12) + 1;
    }

    function signIndexForHouse(houseNumber) {
        const lagnaIndex = getLagnaSignIndex();
        const h = Number.parseInt(houseNumber, 10);
        if (!Number.isFinite(h)) return lagnaIndex;
       return (lagnaIndex + h - 1 + 12) % 12;
    }

'''

if "function normalizeChartResponse(data)" not in src:
    marker = "    const ASPECT_PAIRS = ["
    if marker not in src:
        raise SystemExit("ERROR: Could not find insertion point before ASPECT_PAIRS.")
    src = src.replace(marker, normalizer + "\n" + marker, 1)
else:
    print("INFO: normalization helpers already present; skipping insert.")

# ---------------------------------------------------------------------
# 4. Make house/sign mappig dynamic from calculated Lagna
# ---------------------------------------------------------------------
src = src.replace("((i - 7 + 12) % 12) + 1", "houseForSignIndex(i)")
src = src.replace("(parseInt(h) - 1 + 7) % 12", "signIndexForHouse(h)")
src = src.replace("SIGN_ORDER[(h - 1 + 7) % 12]", "SIGN_ORDER[signIndexForHouse(h)]")

# ---------------------------------------------------------------------
# 5. Replace core aspect filter function for backend-generated IDs
# --------------------------------------------------------------------
new_core_func = r'''    function getCoreAspectType(aspect) {
        const id = String(aspect?.id || "").replace(/-/g, "_").toLowerCase();
        const kind = String(aspect?.aspectKind || "").toLowerCase();
        const importance = String(aspect?.importance || "").toLowerCase();

        const coreList = [
            "conj_moon_saturn",
            "conj_sun_mercury",
            "conj_mercury_jupiter",
            "conj_sun_jupiter",
            "conj_lagna_venus",
           "rahu_7th_h11",
            "ketu_7th_h5",
            "7th_rahu_ketu",
            "7th_ketu_rahu"
        ];

        if (coreList.includes(id)) {
            return "normal";
        }

        // Backend-generated aspects use ids like mars_4th_h9 and saturn_10th_h6.
        // Keep major aspects visible in core mode, hide minor empty-house aspects by default.
        if (importance === "major") {
            return "normal";
        }

        const previewList = [
            "saturn_10thmars",
            "saturn_10th_h6"
        ];

        if (previewList.includes(id) || id.startsWith("mars_")) {
            return "faint";
        }

        if (kind === "conjunction") {
            return "normal";
        }

        return null;
    }

'''

pattern = r"    function getCoreAspectType\(aspect\) \{.*?\n    function getPlanetFocusedAspects"
replacement = new_core_func + "    function getPlanetFocusedAspects"
src2, count = re.subn(pattern, replacement, src, count=1, flags=re.S)

if count == 0:
    print("WARN: getCoreAspectType function not found or already patched.")
else:
    src = src2

path.write_text(src, encoding="utf-8")
print("DONE: app.js patched.")
print("Backup saved as app.js.bak")
