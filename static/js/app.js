// Pratyabhijna Immersive JS

document.addEventListener("DOMContentLoaded", () => {
    // --- Application State ---
    const state = {
        placements: [],
        currentMode: "chart", // chart, nak, aspect, transit, dasha
        focusedGraha: null,
        isRevealed: false,
        axisFlowAngle: null, // angle for star drift force along Rahu-Ketu axis
        aspectTimeouts: [],
        aspectFilter: "core",
        hoveredGraha: null,
        hoveredAspectId: null
    };

    // --- DOM Elements ---
    try {
        initCesiumEarthScene();
    } catch (e) {
        console.warn("Cesium initialization bypassed:", e);
    }
    const canvas = document.getElementById('skyOverlay');
    const ctx = canvas.getContext('2d');
    const portal = document.getElementById('portal');
    const stage = document.getElementById('stage');
    const stageBig = document.getElementById('stageBig');
    const stageCopy = document.getElementById('stageCopy');
    const mandala = document.getElementById('mandala');
    const chart = document.getElementById('chart');
    
    // Floating detail card
    const card = document.getElementById('oracleCard');
    const cardGlyph = document.getElementById('cardGlyph');
    const cardTitle = document.getElementById('cardTitle');
    const cardMeta = document.getElementById('cardMeta');
    const cardMeaning = document.getElementById('cardMeaning');
    const askOracleBtn = document.getElementById('askOracleBtn');
    
    const modes = document.getElementById('modes');
    const status = document.getElementById('status');
    const timeline = document.getElementById('timeline');
    const ritual = document.getElementById('ritual');
    
    // Oracle pill & Command card
    const oraclePill = document.getElementById('oraclePill');
    const command = document.getElementById('command');
    const closeCommandBtn = document.getElementById('closeCommandBtn');
    const msgs = document.getElementById('msgs');
    const askInput = document.getElementById('ask');
    const sendBtn = document.getElementById('send');
    const chipsContainer = document.getElementById('oracleChips');
    
    // Nakshatra Summary list
    const nakSummary = document.getElementById('nakSummary');
    const nakSummaryList = document.getElementById('nakSummaryList');
    const closeNakBtn = document.getElementById('closeNakBtn');

    // Close / Minimizer bindings
    document.getElementById("closeNakBtn").addEventListener("click", () => setMode("chart"));

    oraclePill.addEventListener("click", () => {
        command.classList.remove("collapsed");
        oraclePill.classList.add("hidden");
        setTimeout(() => askInput.focus(), 300);
    });

    closeCommandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        command.classList.add("collapsed");
        oraclePill.classList.remove("hidden");
    });

    // Suggested Chips click events
    chipsContainer.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip");
        if (!chip) return;
        const query = chip.getAttribute("data-query");
        askInput.value = query;
        send();
    });

    // Tooltip Card "Ask about this" button
    askOracleBtn.addEventListener("click", () => {
        const target = askOracleBtn.getAttribute("data-target");
        if (target) {
            command.classList.remove("collapsed");
            oraclePill.classList.add("hidden");
            askInput.value = `explain ${target}`;
            send();
        }
    });


    // --- Canvas Cosmic Background ---
    let W, H, DPR;
    let phase = 'earth'; // earth -> zoom -> leave
    let earthScale = 1;
    let earthSpin = 0;
    let earthAlpha = 1;
    let skyAlpha = 0;
    let revealed = false;
    let stars = [];
    let dust = [];
    let chartCx = window.innerWidth / 2;
    let chartCy = window.innerHeight / 2;

    // Faint golden dust particles near the chart center
    class DustParticle {
        constructor() {
            this.reset();
        }
        reset() {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 90 + 30; // spawn near chart core
            this.x = chartCx + Math.cos(angle) * radius;
            this.y = chartCy + Math.sin(angle) * radius;
            this.size = Math.random() * 0.75 + 0.15;
            this.alpha = Math.random() * 0.4 + 0.1;
            this.speed = Math.random() * 0.1 + 0.02;
            this.angle = angle;
            this.tw = Math.random() * Math.PI;
        }
        update() {
            if (state.axisFlowAngle !== null && state.axisFlowAngle !== undefined) {
                // Flow along the axis line
                const speed = 1.4;
                this.x += Math.cos(state.axisFlowAngle) * speed;
                this.y += Math.sin(state.axisFlowAngle) * speed;
                
                const dist = Math.hypot(this.x - chartCx, this.y - chartCy);
                if (dist > Math.min(W, H) * 0.45) {
                    const t = Math.random() * 2 - 1;
                    const R = Math.min(W, H) * 0.4 * t;
                    this.x = chartCx + Math.cos(state.axisFlowAngle) * R;
                    this.y = chartCy + Math.sin(state.axisFlowAngle) * R;
                    this.size = Math.random() * 1.5 + 0.4;
                    this.alpha = Math.random() * 0.7 + 0.2;
                }
            } else {
                this.angle += 0.0008;
                const radius = Math.hypot(this.x - chartCx, this.y - chartCy) + 0.12; // slowly drift outwards
                this.x = chartCx + Math.cos(this.angle) * radius;
                this.y = chartCy + Math.sin(this.angle) * radius;
                this.alpha = (0.15 + Math.sin(this.tw) * 0.15);
                this.tw += 0.008;
                
                if (radius > Math.min(W, H) * 0.5) {
                    this.reset();
                }
            }
        }
        draw() {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = '#f4c978'; // golden color variables
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W * DPR;
        canvas.height = H * DPR;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        stars = Array.from({ length: Math.floor((W * H) / 6000) }, () => ({
            x: Math.random() * W,
            y: Math.random() * H,
            z: Math.random(),
            tw: Math.random() * Math.PI * 2
        }));

        dust = [];
        for (let i = 0; i < 45; i++) {
            dust.push(new DustParticle());
        }

        if (revealed) {
            buildChart(true);
            if (state.currentMode === 'aspect') {
                redrawAspectArcs();
            }
        }
    }
    window.addEventListener('resize', resize);
    resize();

    function drawStars() {
        ctx.save();
        for (const s of stars) {
            s.tw += 0.015 + s.z * 0.01;
            
            let dx = 0.015 + s.z * 0.02;
            let dy = 0.015 + s.z * 0.02;

            if (state.axisFlowAngle !== null && state.axisFlowAngle !== undefined) {
                // Accelerate stars along Rahu-Ketu coordinate axis direction
                dx += Math.cos(state.axisFlowAngle) * 0.35;
                dy += Math.sin(state.axisFlowAngle) * 0.35;
            }

            s.y += dy;
            if (s.y > H) {
                s.y = 0;
                s.x = Math.random() * W;
            }
            
            const a = (0.16 + s.z * 0.72) * (0.55 + Math.sin(s.tw) * 0.45);
            ctx.globalAlpha = a;
            ctx.beginPath();
            ctx.arc(s.x, s.y, (0.45 + s.z * 1.3), 0, Math.PI * 2);
            ctx.fillStyle = s.z > 0.72 ? '#ffe8b0' : '#d8c5ff';
            ctx.fill();
        }
        ctx.restore();
    }

    function drawEarth() {
        const t = performance.now() / 1000;
        if (phase === 'zoom') {
            earthScale += (1.72 - earthScale) * 0.035;
        }
        if (phase === 'leave') {
            earthScale += (0.15 - earthScale) * 0.025;
            earthAlpha += (0 - earthAlpha) * 0.025;
            skyAlpha += (1 - skyAlpha) * 0.025;
        }
        
        const R = Math.min(W, H) * 0.185 * earthScale;
        const x = W / 2;
        const y = H * 0.48 + (earthScale - 1) * H * 0.05;
        
        ctx.save();
        ctx.globalAlpha = earthAlpha;
        
        const grd = ctx.createRadialGradient(x - R * 0.32, y - R * 0.42, R * 0.04, x, y, R * 1.08);
        grd.addColorStop(0, '#ffffff');
        grd.addColorStop(0.13, '#9efff4');
        grd.addColorStop(0.28, '#39bbff');
        grd.addColorStop(0.52, '#123aa0');
        grd.addColorStop(0.8, '#061235');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(x, y, R * 1.02, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(127,255,242,.28)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(x, y, R * 1.22, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(244,201,120,.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, R * 0.98, 0, Math.PI * 2);
        ctx.clip();
        
        for (let i = 0; i < 17; i++) {
            const lat = -0.78 + i * 0.1;
            ctx.beginPath();
            ctx.ellipse(x, y + lat * R, R * Math.sqrt(Math.max(0.03, 1 - lat * lat)), R * 0.055, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,.075)';
            ctx.stroke();
        }
        
        for (let i = 0; i < 13; i++) {
            const lon = earthSpin + i * Math.PI / 6.5;
            const ex = Math.sin(lon) * R * 0.62;
            ctx.beginPath();
            ctx.ellipse(x + ex, y, Math.abs(Math.cos(lon)) * R * 0.96, R * 0.96, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,.07)';
            ctx.stroke();
        }
        
        ctx.fillStyle = 'rgba(70,232,178,.34)';
        for (let i = 0; i < 14; i++) {
            const a = earthSpin * 0.75 + i * 1.43;
            ctx.beginPath();
            ctx.ellipse(x + Math.sin(a) * R * 0.56, y + Math.cos(a * 1.37) * R * 0.38, R * (0.045 + (i % 4) * 0.018), R * (0.022 + (i % 3) * 0.015), a, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        
        if (phase === 'zoom' || phase === 'leave') {
            const px = x + Math.sin(earthSpin + 1.2) * R * 0.52;
            const py = y - R * 0.12;
            ctx.beginPath();
            ctx.arc(px, py, 5 + Math.sin(t * 8) * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffe8b0';
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(px, py, 24 + Math.sin(t * 3) * 9, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(244,201,120,.45)';
            ctx.stroke();
            
            ctx.fillStyle = 'rgba(255,232,176,.92)';
            ctx.font = '12px Inter';
            ctx.fillText(document.getElementById('place').value || 'Birthplace', px + 16, py - 16);
        }
        ctx.restore();
    }

    function drawSky() {
        if (skyAlpha <= 0.01) return;
        ctx.save();
        ctx.globalAlpha = skyAlpha * 0.55;
        
        const cx = chartCx;
        const cy = chartCy;
        const chartEl = document.getElementById('chart');
        let R = Math.min(W, H) * 0.39;
        if (chartEl) {
            const rect = chartEl.getBoundingClientRect();
            if (rect.width > 0) {
                R = rect.width * 0.46;
            }
        }
        
        for (let i = 0; i < 108; i++) {
            const a = i * Math.PI * 2 / 108 - Math.PI / 2 + earthSpin * 0.04;
            const len = i % 9 === 0 ? R : R * 0.98;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * R * 0.52, cy + Math.sin(a) * R * 0.52);
            ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
            ctx.strokeStyle = i % 9 === 0 ? 'rgba(244,201,120,.13)' : 'rgba(127,255,242,.045)';
            ctx.stroke();
        }
        
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(244,201,120,.18)';
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.652, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(216,197,255,.09)';
        ctx.stroke();
        ctx.restore();
    }

    function animate() {
        ctx.clearRect(0, 0, W, H);
        drawStars();
        
        // Update chart center dynamically based on physical DOM element positioning
        const chartEl = document.getElementById('chart');
        if (chartEl && revealed) {
            const rect = chartEl.getBoundingClientRect();
            if (rect.width > 0) {
                chartCx = rect.left + rect.width / 2;
                chartCy = rect.top + rect.height / 2;
            }
        } else {
            chartCx = W / 2;
            chartCy = H / 2;
        }
        
        // Update and draw golden dust particles near mandala core
        if (revealed) {
            dust.forEach(d => {
                d.update();
                d.draw();
            });
        }

        earthSpin += 0.006;
        drawSky();
        requestAnimationFrame(animate);
    }
    animate();


    // --- Staging & Reveal Flow ---
    document.getElementById('reveal').addEventListener('click', (e) => {
        if (e) e.preventDefault();
        const dob = document.getElementById('dob').value;
        const timeVal = document.getElementById('time').value;
        const placeVal = document.getElementById('place').value;

        // Hide normal UI and apply cinematic watermark overlay
        portal.classList.add('hidden');
        ritual.classList.add('on');
        stage.classList.add('show');
        document.querySelector('.app').classList.add('cinema');
        
        stageBig.textContent = 'Anchoring birthplace';
        stageCopy.textContent = 'The Earth remembers the place.';

        const body = {
            dob: dob,
            tob: timeVal,
            pob: placeVal,
            ayanamsha: "LAHIRI"
        };
        console.log("SUBMIT TRIGGERED");
        console.log("SENDING BODY:", body);

        // Fetch chart data immediately in parallel with Earth fly-in
        let fetchPromise = fetch('/api/chart/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        .then(res => res.json())
        .then(data => {
            console.log("API RESPONSE METADATA:", data.metadata);
            console.table(data.placements.map(p => ({
                name: p.name,
                longitude: p.longitude,
                sign: p.sign,
                house: p.house
            })));

            const normalized = normalizeChartResponse(data);
            state.placements = normalized.placements;
            // Use backend-computed aspects if available, fallback to hardcoded
            if (normalized.aspects && normalized.aspects.length > 0) {
                window.HARD_CODED_ASPECTS = normalized.aspects;
                console.log(`Loaded ${normalized.aspects.length} computed aspects from backend.`);
            }
            // Store dasha data for oracle/UI display
            if (data.dasha) {
                state.dashaCurrent = data.dasha.current;
                state.dashaTimeline = data.dasha.timeline;
                state.dashaAntardashas = data.dasha.antardashas;
                state.birthNakshatra = data.dasha.birth_nakshatra;
            }
            // Store metadata
            if (data.metadata) {
                state.chartMetadata = data.metadata;
                console.log(`Chart calculated via ${data.metadata.ayanamsha} ayanamsha for ${data.metadata.place_resolved || data.metadata.pob}`);
            }
            if (data.status === 'fallback') {
                console.warn('Chart using fallback data:', data.message);
            }
            return data;
        })
        .catch(err => {
            console.error("Calculation fetch failed, loading dummy:", err);
            return fetch('/api/chart/dummy')
                .then(res => res.json())
                .then(data => {
                    const normalized = normalizeChartResponse(data);
                    state.placements = normalized.placements;
                    console.table(state.placements.map(p => ({
                    name: p.name,
                    absolute_longitude: p.absolute_longitude,
                    degree: p.degree,
                    sign_degree: p.sign_degree,
                    sign: p.sign,
                    house: p.house
                })));
                    if (normalized.aspects && normalized.aspects.length > 0) {
                        window.HARD_CODED_ASPECTS = normalized.aspects;
                    }

                    return data;
                });
        });

        // Trigger the 3D Earth Reveal Journey if Cesium loaded successfully
        if (typeof Cesium !== 'undefined' && typeof viewer !== 'undefined' && viewer) {
            beginRevealJourney(
                placeVal,
                // 1. Zoom in complete (at birthplace coordinate)
                (coords) => {
                    const latStr = coords.lat >= 0 ? `${coords.lat.toFixed(4)}° N` : `${Math.abs(coords.lat).toFixed(4)}° S`;
                    const lonStr = coords.lon >= 0 ? `${coords.lon.toFixed(4)}° E` : `${Math.abs(coords.lon).toFixed(4)}° W`;
                    stageBig.textContent = 'Coordinates Locked';
                    stageCopy.textContent = `${placeVal} (${latStr}, ${lonStr})`;
                    
                    // Transition to Phase 3: Leaving Earth
                    setTimeout(() => {
                        stageBig.textContent = 'Ascending to Sky';
                        stageCopy.textContent = 'The sky remembers the moment.';
                    }, 1100);
                },
                // 2. Zoom out complete (deep space reached, Earth faded)
                () => {
                    // Ensure data is loaded before forming the mandala
                    fetchPromise.then(() => {
                        stageBig.textContent = 'Forming Mandala';
                        stageCopy.textContent = 'Grahas settle into D1.';
                        skyAlpha = 1;

                        setTimeout(() => {
                            ritual.classList.remove('on');
                            stage.classList.add('fade');
                            mandala.classList.add('on');
                            modes.classList.add('on');
                            
                            // Status is kept hidden by default for visual cleanliness
                            status.classList.remove('on');
                            
                            // Slide out the oracle pill
                            oraclePill.classList.remove("hidden");

                            revealed = true;
                            document.querySelector('.app').classList.add('revealed');
                            
                            // Build mandala elements dynamically
                            buildChart();
                            
                            addAI('The mandala is revealed. Hover any graha, press <b>R</b> for Rahu, <b>M</b> for Moon, <b>A</b> for aspects, or open <b>Gochar</b>.');
                            
                            setTimeout(() => stage.classList.remove('show', 'fade'), 1200);
                        }, 1600);
                    });
                }
            );
        } else {
            // Fallback: Skip Earth fly-in and immediately fade in mandala
            fetchPromise.then(() => {
                stageBig.textContent = 'Ascending to Sky';
                stageCopy.textContent = 'The sky remembers the moment.';
                skyAlpha = 1;

                setTimeout(() => {
                    stageBig.textContent = 'Forming Mandala';
                    stageCopy.textContent = 'Grahas settle into D1.';
                }, 1000);

                setTimeout(() => {
                    ritual.classList.remove('on');
                    stage.classList.add('fade');
                    mandala.classList.add('on');
                    modes.classList.add('on');
                    
                    status.classList.remove('on');
                    oraclePill.classList.remove("hidden");
                    revealed = true;
                    document.querySelector('.app').classList.add('revealed');
                    
                    buildChart();
                    addAI('The mandala is revealed. Hover any graha, press <b>R</b> for Rahu, <b>M</b> for Moon, <b>A</b> for aspects, or open <b>Gochar</b>.');
                    
                    setTimeout(() => stage.classList.remove('show', 'fade'), 1200);
                }, 2200);
            });
        }
    });


    // --- Mandala Draw Engine Constants ---
    const SIGN_ORDER = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
    const SIGN_ALIASES = {
    "aries": 0, "mesa": 0, "meṣa": 0, "mesha": 0,
    "taurus": 1, "vrsabha": 1, "vṛṣabha": 1, "vrishabha": 1,
    "gemini": 2, "mithuna": 2,
    "cancer": 3, "karka": 3,
    "leo": 4, "simha": 4, "siṃha": 4,
    "virgo": 5, "kanya": 5, "kanyā": 5,
    "libra": 6, "tula": 6, "tulā": 6,
    "scorpio": 7, "vrscika": 7, "vṛścika": 7, "vrischika": 7,
    "sagittarius": 8, "dhanu": 8, "dhanus": 8,
    "capricorn": 9, "makara": 9,
    "aquarius": 10, "kumbha": 10,
    "pisces": 11, "mina": 11, "mīna": 11, "meena": 11
};

function cleanKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function signIndexFromPlacement(g) {
    const signName = cleanKey(g.sign || g.rashi_english || g.rashi);
    if (Object.prototype.hasOwnProperty.call(SIGN_ALIASES, signName)) {
        return SIGN_ALIASES[signName];
    }

    const direct = SIGN_ORDER.findIndex(s => cleanKey(s) === signName);
    if (direct !== -1) return direct;

    return -1;
}

function absoluteLongitudeFromPlacement(g) {
    // Real API path: full 0–360 longitude.
    const direct = Number(
        g.absolute_longitude ??
        g.longitude ??
        g.sidereal_longitude ??
        g.lon
    );

    if (Number.isFinite(direct)) {
        return normalizeLongitude(direct);
    }

    // Dummy-data path: sign + within-sign degree.
    const signIndex = signIndexFromPlacement(g);
    const signDegree = Number(g.sign_degree ?? g.degree ?? 0);

    if (signIndex !== -1 && Number.isFinite(signDegree)) {
        return normalizeLongitude(signIndex * 30 + signDegree);
    }

    console.warn("Could not resolve absolute longitude for placement:", g);
    return 0;
}

function formatDegreeLabel(signDegree) {
    const d = Math.floor(signDegree);
    const m = Math.floor((signDegree - d) * 60);
    return `${d}°${String(m).padStart(2, "0")}′`;
}

    const GRAHA_COLORS = {
        "Sun": { color: "#f4c978", glow: "rgba(244, 201, 120, 0.65)" },
        "Moon": { color: "#ffffff", glow: "rgba(255, 255, 255, 0.65)" },
        "Mars": { color: "#ff5555", glow: "rgba(255, 85, 85, 0.65)" },
        "Mercury": { color: "#34d399", glow: "rgba(52, 211, 153, 0.65)" },
        "Jupiter": { color: "#ffe8b0", glow: "rgba(255, 232, 176, 0.65)" },
        "Venus": { color: "#f472b6", glow: "rgba(244, 114, 182, 0.65)" },
        "Saturn": { color: "#818cf8", glow: "rgba(129, 140, 248, 0.65)" },
        "Rahu": { color: "#c084fc", glow: "rgba(192, 132, 252, 0.65)" },
        "Ketu": { color: "#fda4af", glow: "rgba(253, 164, 175, 0.65)" },
        "Lagna": { color: "#fef08a", glow: "rgba(254, 240, 138, 0.65)" }
    };


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
    if (!g || typeof g !== "object") return null;

    const name = g.name || g.graha || g.planet || "Unknown";
    const style = GRAHA_COLORS[name] || GRAHA_COLORS["Lagna"] || {
        color: "#fef08a",
        glow: "rgba(254, 240, 138, 0.65)"
    };

    const lon = absoluteLongitudeFromPlacement(g);

    const signIndex = Math.floor(lon / 30);
    const signDegreeRaw = Number(g.sign_degree ?? (lon % 30));
    const signDegree = Number.isFinite(signDegreeRaw) ? signDegreeRaw : (lon % 30);

    const houseNum = Number.parseInt(g.house ?? g.house_number ?? 1, 10);

    return {
        ...g,
        name,

        // Full zodiac longitude for visual placement.
        absolute_longitude: lon,
        longitude: lon,
        visual_longitude: lon,

        // Keep degree as within-sign degree for old display/card code.
        degree: Number(signDegree.toFixed(4)),
        sign_degree: Number(signDegree.toFixed(4)),
        degree_label: g.degree_label || formatDegreeLabel(signDegree),

        glyph: g.glyph || GRAHA_GLYPHS[name] || "•",
        color: g.color || style.color,
        glow: g.glow || style.glow,

        house: Number.isFinite(houseNum) ? houseNum : 1,
        sign: g.sign || SIGN_ORDER[signIndex] || g.rashi || "Unknown",
        rashi: g.rashi || g.sign || SIGN_ORDER[signIndex] || "Unknown",

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

    const from = a.from ?? a.fromGraha ?? a.source ?? a.source_graha ?? "";
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
        targetSign,
        targetType: a.targetType ?? a.target_type ?? (to && !String(to).startsWith("H") ? "graha" : "house"),
        color: a.color || (GRAHA_COLORS[from]?.color) || "#f4c978",
        label: a.label || `${from} ${aspectKind} → ${targetSign || to || "target"}`,
        description: a.description || "",
        strength: Number(a.strength ?? 1.0),
        importance: a.importance || "major",
        receiving_grahas: a.receiving_grahas || a.receivingGrahas || []
    };
}

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
        .map(normalizeAspect)
        .filter(Boolean);

    return { placements, aspects };
}

function getLagnaSignIndex() {
    const lagna = state.placements.find(p => p.name === "Lagna");

    if (lagna) {
        const bySign = SIGN_ORDER.findIndex(
            s => s.toLowerCase() === String(lagna.sign || "").toLowerCase()
        );
        if (bySign !== -1) return bySign;

        const byLongitude = Math.floor(normalizeLongitude(lagna.absolute_longitude) / 30);
        if (Number.isFinite(byLongitude)) return byLongitude;
    }

    // Scorpio fallback for your original demo chart.
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


    const ASPECT_PAIRS = [
        { from: "Moon", to: "Saturn", label: "Moon–Saturn · Puṣya Conjunction", color: "#818cf8" },
        { from: "Sun", to: "Mercury", label: "Sun–Mercury · 12th House Conjunction", color: "#f4c978" },
        { from: "Mercury", to: "Jupiter", label: "Mercury–Jupiter · Libra 12th Conjunction", color: "#34d399" },
        { from: "Rahu", to: "Ketu", label: "Rahu–Ketu · Karmic Opposition Axis", color: "#c084fc" },
        { from: "Lagna", to: "Venus", label: "Lagna–Venus · Scorpio Identity Conjunction", color: "#fef08a" }
    ];

    const rashis = ["Meṣa", "Vṛṣabha", "Mithuna", "Karka", "Siṃha", "Kanyā", "Tulā", "Vṛścika", "Dhanu", "Makara", "Kumbha", "Mīna"];
    const naks = ["Aśvinī", "Bharaṇī", "Kṛttikā", "Rohiṇī", "Mṛgaśīrṣa", "Ārdrā", "Punarvasu", "Puṣya", "Āśleṣā", "Maghā", "P.Phalgunī", "U.Phalgunī", "Hasta", "Citrā", "Svātī", "Viśākhā", "Anurādhā", "Jyeṣṭhā", "Mūla", "P.Āṣāḍhā", "U.Āṣāḍhā", "Śravaṇa", "Dhaniṣṭhā", "Śatabhiṣaj", "P.Bhādra", "U.Bhādra", "Revatī"];
    const NAKSHATRA_NAMES = [
        "Aśvinī", "Bharaṇī", "Kṛttikā", "Rohiṇī", "Mṛgaśīrṣa", "Ārdrā", "Punarvasu", "Puṣya", "Āśleṣā", 
        "Maghā", "P.Phalgunī", "U.Phalgunī", "Hasta", "Citrā", "Svātī", "Viśākhā", "Anurādhā", "Jyeṣṭhā", 
        "Mūla", "P.Āṣāḍhā", "U.Āṣāḍhā", "Śravaṇa", "Dhaniṣṭhā", "Śatabhiṣaj", "P.Bhādra", "U.Bhādra", "Revatī"
    ];
    const NAKSHATRA_FULL_NAMES = [
        "Aśvinī", "Bharaṇī", "Kṛttikā", "Rohiṇī", "Mṛgaśīrṣa", "Ārdrā", "Punarvasu", "Puṣya", "Āśleṣā", 
        "Maghā", "Pūrva Phalgunī", "Uttara Phalgunī", "Hasta", "Citrā", "Svātī", "Viśākhā", "Anurādhā", "Jyeṣṭhā", 
        "Mūla", "Pūrva Āṣāḍhā", "Uttara Āṣāḍhā", "Śravaṇa", "Dhaniṣṭhā", "Śatabhiṣaj", "Pūrva Bhādrapadā", "Uttara Bhādrapadā", "Revatī"
    ];
    const NAKSHATRA_SHORT_NAMES = [
        "Aśvinī", "Bharaṇī", "Kṛttikā", "Rohiṇī", "Mṛgaśīrṣa", "Ārdrā", "Punarvasu", "Puṣya", "Āśleṣā", 
        "Maghā", "P.Phalgunī", "U.Phalgunī", "Hasta", "Citrā", "Svātī", "Viśākhā", "Anurādhā", "Jyeṣṭhā", 
        "Mūla", "P.Āṣāḍhā", "U.Āṣāḍhā", "Śravaṇa", "Dhaniṣṭhā", "Śatabhiṣaj", "P.Bhādra", "U.Bhādra", "Revatī"
    ];

    function getNakshatraIndex(nakName) {
        if (!nakName) return -1;
        let idx = NAKSHATRA_FULL_NAMES.findIndex(n => n.toLowerCase() === nakName.toLowerCase());
        if (idx !== -1) return idx;
        idx = NAKSHATRA_SHORT_NAMES.findIndex(n => n.toLowerCase() === nakName.toLowerCase());
        return idx;
    }

    function localXY(deg, r = 0.39) {
        const a = (deg - 90) * Math.PI / 180;
        return {
            x: 50 + Math.cos(a) * r * 100,
            y: 50 + Math.sin(a) * r * 100
        };
    }

    // Donut wedge path generator in 800x800 SVG coordinate space
    function createWedgePath(cx, cy, rInner, rOuter, startAngle, endAngle) {
        const a1 = (startAngle - 90) * Math.PI / 180;
        const a2 = (endAngle - 90) * Math.PI / 180;
        
        const x1_in = cx + Math.cos(a1) * rInner;
        const y1_in = cy + Math.sin(a1) * rInner;
        const x2_in = cx + Math.cos(a2) * rInner;
        const y2_in = cy + Math.sin(a2) * rInner;
        
        const x1_out = cx + Math.cos(a1) * rOuter;
        const y1_out = cy + Math.sin(a1) * rOuter;
        const x2_out = cx + Math.cos(a2) * rOuter;
        const y2_out = cy + Math.sin(a2) * rOuter;
        
        const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
        
        return `M ${x1_in} ${y1_in} 
                L ${x1_out} ${y1_out} 
                A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2_out} ${y2_out} 
                L ${x2_in} ${y2_in} 
                A ${rInner} ${rInner} 0 ${largeArc} 0 ${x1_in} ${y1_in} Z`;
    }

    function getSvgCoords(deg, r) {
        const a = (deg - 90) * Math.PI / 180;
        const R = 800 * r; // Scaled to match the S * r radius logic in localXY
        return {
            x: 400 + Math.cos(a) * R,
            y: 400 + Math.sin(a) * R
        };
    }

    function renderSectorWedges() {
        const svg = document.getElementById('chartOverlay');
        
        // 1. Render House wedges (inner area: 88 to 240)
        let gHouses = document.getElementById('houseWedges');
        if (!gHouses) {
            gHouses = document.createElementNS("http://www.w3.org/2000/svg", "g");
            gHouses.setAttribute("id", "houseWedges");
            const focusW = document.getElementById('focusWedges');
            svg.insertBefore(gHouses, focusW);
        } else {
            gHouses.innerHTML = '';
        }

        for (let i = 0; i < 12; i++) {
            const houseNum = houseForSignIndex(i);
            const startAngle = i * 30;
            const endAngle = (i + 1) * 30;
            const d = createWedgePath(400, 400, 88, 240, startAngle, endAngle);
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            path.setAttribute("class", "houseWedge");
            path.setAttribute("data-house", houseNum);
            path.setAttribute("data-sign-index", i);

            path.addEventListener('mouseenter', () => {
                highlightHouseOnly(houseNum);
            });
            path.addEventListener('mouseleave', () => {
                clearSectorHighlightsOnly();
            });
            path.addEventListener('click', () => {
                clearSectorHighlights();
                highlightHouse(houseNum);
            });

            gHouses.appendChild(path);
        }

        // 2. Render Rashi wedges (outer ring: 240 to 344)
        let gWedges = document.getElementById('rashiWedges');
        if (!gWedges) {
            gWedges = document.createElementNS("http://www.w3.org/2000/svg", "g");
            gWedges.setAttribute("id", "rashiWedges");
            const focusW = document.getElementById('focusWedges');
            svg.insertBefore(gWedges, focusW);
        } else {
            gWedges.innerHTML = '';
        }

        for (let i = 0; i < 12; i++) {
            const startAngle = i * 30;
            const endAngle = (i + 1) * 30;
            const d = createWedgePath(400, 400, 240, 344, startAngle, endAngle);
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            path.setAttribute("class", "rashiWedge");
            path.setAttribute("data-index", i);
            path.setAttribute("data-sign", SIGN_ORDER[i]);
            
            const houseNum = houseForSignIndex(i);
            path.setAttribute("data-house", houseNum);

            path.addEventListener('mouseenter', () => {
                highlightRashiSectorOnly(i);
            });
            path.addEventListener('mouseleave', () => {
                clearSectorHighlightsOnly();
            });
            path.addEventListener('click', () => {
                highlightRashiSector(i, rashis[i]);
            });

            gWedges.appendChild(path);
        }
    }

    function highlightRashiSectorOnly(index) {
        const wedges = document.querySelectorAll('.rashiWedge');
        wedges.forEach((w, idx) => {
            if (idx === index) {
                w.classList.add('active');
            } else {
                w.classList.remove('active');
            }
        });
        
        const rashiLbls = document.querySelectorAll('.rashiLabel');
        rashiLbls.forEach((el, idx) => {
            if (idx === index) {
                el.style.opacity = '1';
                el.style.color = 'var(--gold)';
                el.style.filter = 'drop-shadow(0 0 10px var(--gold))';
            }
        });

        const houseNum = ((index - 7 + 12) % 12) + 1;
        document.querySelectorAll('.houseLabel').forEach(hl => {
            if (parseInt(hl.dataset.house) === houseNum) {
                hl.classList.add('bright');
            }
        });
    }

    function highlightHouseOnly(h) {
        document.querySelectorAll('.houseWedge').forEach(hw => {
            if (parseInt(hw.dataset.house) === parseInt(h)) {
                hw.classList.add('active');
            } else {
                hw.classList.remove('active');
            }
        });
        
        document.querySelectorAll('.houseLabel').forEach(hl => {
            if (parseInt(hl.dataset.house) === parseInt(h)) {
                hl.classList.add('bright');
            } else {
                hl.classList.remove('bright');
            }
        });
    }

    function clearSectorHighlightsOnly() {
        document.querySelectorAll('.rashiWedge').forEach(w => {
            w.classList.remove('active', 'house-active');
        });
        document.querySelectorAll('.houseWedge').forEach(hw => {
            hw.classList.remove('active');
        });
        document.querySelectorAll('.rashiLabel').forEach((el) => {
            el.style.opacity = '';
            el.style.color = '';
            el.style.filter = 'none';
        });
        document.querySelectorAll('.houseLabel').forEach(hl => {
            hl.classList.remove('bright');
        });
    }

    function highlightRashi(sign) {
        let signIndex = -1;
        if (typeof sign === 'number') {
            signIndex = sign;
        } else {
            signIndex = SIGN_ORDER.findIndex(s => s.toLowerCase() === sign.toLowerCase());
        }
        if (signIndex === -1) return;

        const wedges = document.querySelectorAll('.rashiWedge');
        wedges.forEach((w, idx) => {
            if (idx === signIndex) {
                w.classList.add('active');
            }
        });

        const rashiLbls = document.querySelectorAll('.rashiLabel');
        rashiLbls.forEach((el, idx) => {
            if (idx === signIndex) {
                el.style.opacity = '1';
                el.style.color = 'var(--gold)';
                el.style.filter = 'drop-shadow(0 0 10px var(--gold))';
            }
        });
    }

    function highlightHouse(h) {
        const signIndex = signIndexForHouse(h);

        const wedges = document.querySelectorAll('.rashiWedge');
        wedges.forEach((w, idx) => {
            if (idx === signIndex) {
                w.classList.add('house-active');
            }
        });

        // Also activate the house wedge
        document.querySelectorAll('.houseWedge').forEach(hw => {
            if (parseInt(hw.dataset.house) === parseInt(h)) {
                hw.classList.add('active');
            }
        });

        document.querySelectorAll('.houseLabel').forEach(hl => {
            if (parseInt(hl.dataset.house) === parseInt(h)) {
                hl.classList.add('bright');
            }
        });
    }

    function clearHouseHighlights() {
        document.querySelectorAll('.houseLabel').forEach(hl => {
            hl.classList.remove('bright');
        });
        document.querySelectorAll('.houseWedge').forEach(hw => {
            hw.classList.remove('active');
        });
        document.querySelectorAll('.rashiWedge').forEach(w => {
            w.classList.remove('house-active');
        });
    }

    function clearSectorHighlights() {
        clearSectorHighlightsOnly();
        const g = document.getElementById("focusWedges");
        if (g) g.innerHTML = '';
    }

    function highlightNakshatra(nakName) {
        const idx = getNakshatraIndex(nakName);
        if (idx === -1) return;

        const nakSize = 360 / 27;
        const startAngle = idx * nakSize;
        const endAngle = (idx + 1) * nakSize;

        highlightSector(startAngle, endAngle, 360, 396, "cyan-wedge");

        document.querySelectorAll('.nakLabel').forEach(l => {
            if (l.dataset.name === NAKSHATRA_SHORT_NAMES[idx] || l.dataset.name === NAKSHATRA_FULL_NAMES[idx]) {
                l.classList.add('bright');
            } else {
                l.classList.remove('bright');
            }
        });
    }

    function clearNakshatraHighlights() {
        const g = document.getElementById("focusWedges");
        if (g) {
            g.querySelectorAll('.cyan-wedge').forEach(w => w.remove());
        }
        document.querySelectorAll('.nakLabel').forEach(l => {
            l.classList.remove('bright');
        });
    }

    function renderNakshatraLabels(mode) {
        document.querySelectorAll('.nakLabel').forEach(el => el.remove());

        const nakSize = 360 / 27;
        const activeNakIndices = new Set(
            state.placements.map(g => getNakshatraIndex(g.nakshatra)).filter(idx => idx !== -1)
        );

        const width = window.innerWidth;
        const useAbbr = width < 768;

        for (let i = 0; i < 27; i++) {
            let nakName = NAKSHATRA_SHORT_NAMES[i];
            if (useAbbr) {
                const NAK_ABBR_UNICODE = [
                    "Aśv", "Bha", "Kṛt", "Roh", "Mṛg", "Ārd", "Pun", "Puṣ", "Āśl",
                    "Mag", "P.Ph", "U.Ph", "Has", "Cit", "Svā", "Viś", "Anu", "Jye",
                    "Mūl", "P.Āṣ", "U.Āṣ", "Śra", "Dha", "Śat", "P.Bh", "U.Bh", "Rev"
                ];
                nakName = NAK_ABBR_UNICODE[i];
            }
            const isWordActive = activeNakIndices.has(i);
            
            const r = 0.445; // Centered between nakshatraR (0.43) and outerR (0.46)
            const angle = i * nakSize + nakSize / 2;
            const p = localXY(angle, r);
            
            const l = document.createElement('div');
            l.className = 'nakLabel';
            l.textContent = nakName;
            l.dataset.name = NAKSHATRA_SHORT_NAMES[i];
            l.dataset.index = i;
            
            // Premium radial alignment with readability flip
            let rot = angle - 90;
            rot = ((rot + 180) % 360 + 360) % 360 - 180;
            if (rot > 90 || rot < -90) {
                rot += 180;
            }
            
            l.style.setProperty('--rot', `${rot}deg`);
            l.style.left = p.x + '%';
            l.style.top = p.y + '%';
            
            if (isWordActive) {
                l.classList.add('active');
            }
            if (mode === 'all') {
                l.classList.add('bright');
            }
            
            chart.appendChild(l);
        }
    }


    function clearAspectArcs() {
        if (state.aspectTimeouts) {
            state.aspectTimeouts.forEach(t => clearTimeout(t));
            state.aspectTimeouts = [];
        }
        const gArcs = document.getElementById('aspectArcs');
        if (gArcs) {
            gArcs.innerHTML = '';
        }
        const gGhosts = document.getElementById('ghostAnchors');
        if (gGhosts) {
            gGhosts.innerHTML = '';
        }
    }

    function hideAspectTooltip() {
        const tooltip = document.getElementById('aspectTooltip');
        if (tooltip) {
            tooltip.classList.remove('show');
        }
    }

    function getGrahaPosition(name) {
    const g = state.placements.find(p => p.name === name);
    if (!g) return { x: 400, y: 400 };

    // Safe normalized orbital radii (matches 192 to 240 orbit zone)
    const defaultRadius =
        name === "Lagna" ? 0.25 :
        (name === "Rahu" || name === "Ketu") ? 0.27 :
        0.29;

    let r = Number(g.staggerRadius);

    // If staggerRadius is missing, NaN, or suspiciously large, ignore it.
    if (!Number.isFinite(r) || r < 0.15 || r > 0.35) {
        r = defaultRadius;
    }

    let offsetAngle = 0;
    if (state.currentMode === "transit") {
        const knob = document.querySelector('.knob');
        if (knob) {
            const knobLeft = parseFloat(knob.style.left) || 38;
            offsetAngle = (knobLeft / 100 - 0.38) * 60;
        }
    }

    return getSvgCoords(g.absolute_longitude + offsetAngle, r);
}

    function getGrahaAspectOrigin(grahaName, targetPt) {
        const ptCenter = getGrahaPosition(grahaName);
        if (!targetPt) return ptCenter;
        
        const dx = targetPt.x - ptCenter.x;
        const dy = targetPt.y - ptCenter.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.1) return ptCenter;
        
        const grahaRadius = 14; // half of 28px orb
        const padding = 2; // small padding to clear the border cleanly
        const offset = grahaRadius + padding;
        
        return {
            x: ptCenter.x + (dx / dist) * offset,
            y: ptCenter.y + (dy / dist) * offset
        };
    }

    function getGrahaAnchor(grahaName, targetPt) {
        return getGrahaAspectOrigin(grahaName, targetPt);
    }

    function getHouseMouthAnchor(houseNumber) {
        const signIndex = signIndexForHouse(houseNumber);
        const angle = signIndex * 30 + 15;
        return getSvgCoords(angle, 0.11); // mouth of the house wedge (88px radius in 800x800 viewBox)
    }

    function drawHouseMouthPortals() {
        const svg = document.getElementById('chartOverlay');
        let gMouths = document.getElementById('houseMouths');
        if (!gMouths) {
            gMouths = document.createElementNS("http://www.w3.org/2000/svg", "g");
            gMouths.setAttribute("id", "houseMouths");
            svg.appendChild(gMouths);
        } else {
            gMouths.innerHTML = '';
        }

        for (let h = 1; h <= 12; h++) {
            const pos = getHouseMouthAnchor(h);
            const occupied = state.placements.filter(p => parseInt(p.house) === h);
            const isEmpty = occupied.length === 0;

            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.setAttribute("class", "housePortalGroup");
            group.setAttribute("data-house", h);
            
            let portalShape;
            if (isEmpty) {
                portalShape = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                const size = 5;
                const points = `${pos.x},${pos.y - size} ${pos.x + size},${pos.y} ${pos.x},${pos.y + size} ${pos.x - size},${pos.y}`;
                portalShape.setAttribute("points", points);
                portalShape.setAttribute("class", "housePortalRing ghostAnchor");
                portalShape.setAttribute("stroke", "rgba(127, 255, 242, 0.4)");
                portalShape.setAttribute("fill", "none");
            } else {
                portalShape = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                portalShape.setAttribute("cx", pos.x);
                portalShape.setAttribute("cy", pos.y);
                portalShape.setAttribute("r", "5");
                portalShape.setAttribute("class", "housePortalRing");
                portalShape.setAttribute("stroke", "rgba(127, 255, 242, 0.35)");
                portalShape.setAttribute("fill", "rgba(9, 5, 22, 0.6)");
            }
            portalShape.setAttribute("stroke-width", "1px");
            group.appendChild(portalShape);
            
            const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.setAttribute("x", pos.x);
            label.setAttribute("y", pos.y - 8);
            label.setAttribute("text-anchor", "middle");
            label.setAttribute("class", "housePortalLabel");
            label.setAttribute("fill", "rgba(127, 255, 242, 0.6)");
            label.setAttribute("font-size", "7.5px");
            label.setAttribute("font-family", "monospace");
            label.textContent = `H${h}`;
            label.style.opacity = "0";
            label.style.transition = "opacity 0.2s ease";
            group.appendChild(label);
            
            group.addEventListener('mouseenter', (e) => {
                portalShape.setAttribute("stroke", "#7ffff2");
                portalShape.setAttribute("fill", "rgba(127, 255, 242, 0.25)");
                if (!isEmpty) {
                    portalShape.setAttribute("r", "7");
                }
                label.style.opacity = "1";
                
                const signName = SIGN_ORDER[signIndexForHouse(h)];
                let desc = isEmpty ? "Empty target zone receiving dṛṣṭi forces." : `Occupied by: ${occupied.map(p => p.name).join(', ')}`;
                showAspectTooltip({ label: `House ${h} (${signName})`, description: desc }, e);
            });
            
            group.addEventListener('mouseleave', () => {
                portalShape.setAttribute("stroke", isEmpty ? "rgba(127, 255, 242, 0.4)" : "rgba(127, 255, 242, 0.35)");
                portalShape.setAttribute("fill", isEmpty ? "none" : "rgba(9, 5, 22, 0.6)");
                if (!isEmpty) {
                    portalShape.setAttribute("r", "5");
                }
                label.style.opacity = "0";
                hideAspectTooltip();
            });

            gMouths.appendChild(group);
        }
    }

    function drawGhostAnchors() {
        drawHouseMouthPortals();
    }

    function getHouseAnchor(houseNumber) {
        return getHouseMouthAnchor(houseNumber);
    }

    function getCoreAspectType(aspect) {
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

        if (importance === "major" || kind === "conjunction") {
            return "normal";
        }

        // Keep minor aspects of Mars/Saturn faint in core mode for visual context
        if (id.startsWith("mars_") || id.startsWith("saturn_")) {
            return "faint";
        }

        return null;
    }

    function getPlanetFocusedAspects(planetName) {
        if (!planetName) return [];
        
        const pPlacement = state.placements.find(p => p.name === planetName);
        const houseNum = pPlacement ? parseInt(pPlacement.house) : null;
        
        return window.HARD_CODED_ASPECTS.filter(a => {
            if (a.from === planetName || a.to === planetName) return true;
            if (a.receiving_grahas && a.receiving_grahas.includes(planetName)) return true;
            if (houseNum && a.aspectKind === "conjunction" && parseInt(a.targetHouse) === houseNum) return true;
            return false;
        });
    }

    function applyAspectFilterStyles() {
        if (state.currentMode !== "aspect") {
            // Outside aspect mode, let any drawn aspect arcs be fully visible (used by cluster highlights)
            document.querySelectorAll('.aspectArc, .aspectFanout, .aspectFlare').forEach(el => {
                const isArc = el.classList.contains('aspectArc');
                const id = isArc ? el.getAttribute('data-id') : el.dataset.aspectId;
                const aspect = window.HARD_CODED_ASPECTS.find(x => x.id === id);
                if (!aspect) return;

                const defaultOpacity = aspect.aspectKind === "7th" && aspect.targetType === "house" ? 0.45 : 0.75;
                el.style.opacity = el.classList.contains('aspectFanout') ? 0.4 : defaultOpacity;
                el.style.pointerEvents = el.classList.contains('aspectFanout') ? 'none' : 'auto';
            });
            return;
        }

        const filter = state.aspectFilter || "core";
        const activeGraha = state.hoveredGraha || state.focusedGraha;
        const activeAspectId = state.hoveredAspectId || state.lockedAspectId;

        document.querySelectorAll('.aspectArc, .aspectFanout, .aspectFlare').forEach(el => {
            const isArc = el.classList.contains('aspectArc');
            const id = isArc ? el.getAttribute('data-id') : el.dataset.aspectId;
            const aspect = window.HARD_CODED_ASPECTS.find(x => x.id === id);
            if (!aspect) return;

            let opacity = 0;
            let pointerEvents = 'none';
            let strokeWidth = el.classList.contains('aspectFanout') ? "1px" : "1.2px";

            if (activeAspectId) {
                if (id === activeAspectId) {
                    opacity = el.classList.contains('aspectFanout') ? 0.8 : 1.0;
                    pointerEvents = el.classList.contains('aspectFanout') ? 'none' : 'auto';
                    strokeWidth = el.classList.contains('aspectFanout') ? "1.5px" : "3px";
                } else {
                    opacity = 0.05;
                    pointerEvents = 'none';
                }
            } else if (activeGraha) {
                const activeAspects = getPlanetFocusedAspects(activeGraha);
                const isActive = activeAspects.some(a => a.id === id);
                if (isActive) {
                    opacity = el.classList.contains('aspectFanout') ? 0.8 : 1.0;
                    pointerEvents = el.classList.contains('aspectFanout') ? 'none' : 'auto';
                    strokeWidth = el.classList.contains('aspectFanout') ? "1.5px" : "2.5px";
                } else {
                    opacity = 0.05;
                    pointerEvents = 'none';
                }
            } else {
                if (filter === "all") {
                    const defaultOpacity = aspect.aspectKind === "7th" && aspect.targetType === "house" ? 0.45 : 0.75;
                    opacity = el.classList.contains('aspectFanout') ? 0.4 : defaultOpacity;
                    pointerEvents = el.classList.contains('aspectFanout') ? 'none' : 'auto';
                    el.classList.remove("faint-preview");
                } else if (filter === "focused") {
                    opacity = 0;
                    pointerEvents = 'none';
                } else {
                    // core mode
                    const coreType = getCoreAspectType(aspect);
                    if (coreType === "normal") {
                        const defaultOpacity = aspect.aspectKind === "7th" && aspect.targetType === "house" ? 0.45 : 0.75;
                        opacity = el.classList.contains('aspectFanout') ? 0.4 : defaultOpacity;
                        pointerEvents = el.classList.contains('aspectFanout') ? 'none' : 'auto';
                        el.classList.remove("faint-preview");
                    } else if (coreType === "faint") {
                        opacity = el.classList.contains('aspectFanout') ? 0.08 : 0.15;
                        pointerEvents = el.classList.contains('aspectFanout') ? 'none' : 'auto';
                        el.classList.add("faint-preview");
                    } else {
                        opacity = 0;
                        pointerEvents = 'none';
                    }
                }
            }

            el.style.opacity = opacity;
            el.style.pointerEvents = pointerEvents;
            if (isArc) {
                el.style.strokeWidth = strokeWidth;
                if (state.lockedAspectId && id === state.lockedAspectId) {
                    el.classList.add('locked-active');
                } else {
                    el.classList.remove('locked-active');
                }
            }
        });
    }

    function createSecondaryHouseFanout(aspect, parentGroup) {
        if (!aspect.targetHouse) return;
        const targetHouse = parseInt(aspect.targetHouse);
        const occupied = state.placements.filter(p => parseInt(p.house) === targetHouse);
        if (occupied.length === 0) return;
        
        const ptStart = getHouseMouthAnchor(targetHouse);
        
        occupied.forEach(p => {
            const ptEnd = getGrahaAnchor(p.name, ptStart);
            
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("class", "aspectFanout");
            line.setAttribute("x1", ptStart.x);
            line.setAttribute("y1", ptStart.y);
            line.setAttribute("x2", ptEnd.x);
            line.setAttribute("y2", ptEnd.y);
            line.setAttribute("stroke", aspect.color);
            line.setAttribute("stroke-width", "1px");
            line.setAttribute("stroke-dasharray", "2 3");
            line.style.opacity = 0.4;
            line.dataset.aspectId = aspect.id;
            
            parentGroup.appendChild(line);
        });
    }

    function createHouseAspectArc(aspect, parentGroup) {
        let pt1, pt2;
        let cx, cy;
        
        if (aspect.aspectKind === "conjunction") {
            const p1 = getGrahaPosition(aspect.from);
            const p2 = getGrahaPosition(aspect.to);
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist > 0.1) {
                pt1 = { x: p1.x + (dx / dist) * 16, y: p1.y + (dy / dist) * 16 };
                pt2 = { x: p2.x - (dx / dist) * 16, y: p2.y - (dy / dist) * 16 };
                
                const mx = (pt1.x + pt2.x) / 2;
                const my = (pt1.y + pt2.y) / 2;
                const px = -dy / dist * 18;
                const py = dx / dist * 18;
                cx = mx + px;
                cy = my + py;
            } else {
                pt1 = p1;
                pt2 = p2;
                cx = p1.x;
                cy = p1.y;
            }
        } else {
            pt2 = getHouseMouthAnchor(aspect.targetHouse);
            pt1 = getGrahaAnchor(aspect.from, pt2);
            
            const mx = (pt1.x + pt2.x) / 2;
            const my = (pt1.y + pt2.y) / 2;
            const ox = 400, oy = 400;
            
            const dx = pt2.x - pt1.x;
            const dy = pt2.y - pt1.y;
            const len = Math.hypot(dx, dy);
            
            if (len > 0.1) {
                let offset = 40;
                if (aspect.aspectKind === "7th") {
                    offset = 75;
                } else {
                    offset = 45;
                }
                
                let laneShift = 0;
                if (state.aspectFilter === "all" || state.lockedAspectId === aspect.id) {
                    const hash = aspect.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    laneShift = (hash % 5) * 6 - 12; // -12px to +12px
                } else {
                    const hash = aspect.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    laneShift = (hash % 3) * 2 - 2; // -2px to +2px (bundle them slightly closer in core mode)
                }
                offset += laneShift;

                let px = -dy / len * offset;
                let py = dx / len * offset;
                
                const distCenter = Math.hypot(mx - ox, my - oy);
                if (distCenter > 5) {
                    const dot = px * (mx - ox) + py * (my - oy);
                    if (dot < 0) {
                        px = -px;
                        py = -py;
                    }
                }
                
                cx = mx + px;
                cy = my + py;
            } else {
                cx = mx;
                cy = my;
            }
        }

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("id", `arc-${aspect.id}`);
        path.setAttribute("class", "aspectArc");
        if (aspect.aspectKind === "conjunction") {
            path.classList.add("conjunctionArc");
        }
        path.setAttribute("d", `M ${pt1.x} ${pt1.y} Q ${cx} ${cy} ${pt2.x} ${pt2.y}`);
        path.setAttribute("stroke", aspect.color);
        path.setAttribute("fill", "none");
        
        path.setAttribute("data-id", aspect.id);
        path.setAttribute("data-from", aspect.from);
        path.setAttribute("data-to", aspect.to || "");
        path.setAttribute("data-kind", aspect.aspectKind);
        path.setAttribute("data-house", aspect.targetHouse || "");
        path.setAttribute("data-sign", aspect.targetSign || "");
        
        path.style.setProperty('--glow-color', aspect.color);
        
        let defaultOpacity = 0.75;
        if (aspect.aspectKind === "7th" && aspect.targetType === "house") {
            defaultOpacity = 0.45;
        }
        path.style.opacity = defaultOpacity;
        path.dataset.defaultOpacity = defaultOpacity;
        
        path.addEventListener('mouseenter', (e) => {
            if (state.lockedAspectId) return;
            state.hoveredAspectId = aspect.id;
            highlightAspectContext(aspect);
            showAspectTooltip(aspect, e);
        });
        
        path.addEventListener('mouseleave', () => {
            if (state.lockedAspectId) return;
            state.hoveredAspectId = null;
            clearAspectContext();
            hideAspectTooltip();
        });
        
        path.addEventListener('click', (e) => {
            e.stopPropagation();
            focusAspect(aspect.id);
        });

        parentGroup.appendChild(path);
        
        // Add emission flare at source if not conjunction
        if (aspect.aspectKind !== "conjunction") {
            const flare = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            flare.setAttribute("cx", pt1.x);
            flare.setAttribute("cy", pt1.y);
            flare.setAttribute("r", "2.5");
            flare.setAttribute("fill", aspect.color);
            flare.setAttribute("filter", "drop-shadow(0 0 3px " + aspect.color + ")");
            flare.setAttribute("class", "aspectFlare");
            flare.style.opacity = defaultOpacity;
            flare.dataset.aspectId = aspect.id;
            parentGroup.appendChild(flare);
        }
        
        if (aspect.aspectKind !== "conjunction") {
            createSecondaryHouseFanout(aspect, parentGroup);
        }
        
        return path;
    }

    function createAspectArc(aspect, parentGroup) {
        return createHouseAspectArc(aspect, parentGroup);
    }

    function drawAspectArcs(pairs) {
        clearAspectArcs();
        const svg = document.getElementById('chartOverlay');
        let gArcs = document.getElementById('aspectArcs');
        if (!gArcs) {
            gArcs = document.createElementNS("http://www.w3.org/2000/svg", "g");
            gArcs.setAttribute("id", "aspectArcs");
            svg.appendChild(gArcs);
        }

        drawGhostAnchors();

        pairs.forEach(([a, b]) => {
            if (window.HARD_CODED_ASPECTS) {
                const aspect = window.HARD_CODED_ASPECTS.find(x => 
                    (x.from === a && x.to === b) || (x.from === b && x.to === a)
                );
                if (aspect) {
                    createAspectArc(aspect, gArcs);
                }
            }
        });
    }

    function drawHardcodedAspectArcs() {
        clearAspectArcs();
        const svg = document.getElementById('chartOverlay');
        let gArcs = document.getElementById('aspectArcs');
        if (!gArcs) {
            gArcs = document.createElementNS("http://www.w3.org/2000/svg", "g");
            gArcs.setAttribute("id", "aspectArcs");
            svg.appendChild(gArcs);
        }

        drawGhostAnchors();

        if (window.HARD_CODED_ASPECTS) {
            window.HARD_CODED_ASPECTS.forEach(aspect => {
                createAspectArc(aspect, gArcs);
            });
        }
        applyAspectFilterStyles();
    }

    function drawAspectArcsSequentially() {
        clearAspectArcs();
        const svg = document.getElementById('chartOverlay');
        let gArcs = document.getElementById('aspectArcs');
        if (!gArcs) {
            gArcs = document.createElementNS("http://www.w3.org/2000/svg", "g");
            gArcs.setAttribute("id", "aspectArcs");
            svg.appendChild(gArcs);
        }

        drawGhostAnchors();

        if (!window.HARD_CODED_ASPECTS) return;

        const groupOrder = [
            "Moon-Saturn Puṣya conjunction",
            "Libra 12th cluster",
            "Scorpio identity/aura",
            "Standard 7th Aspects",
            "Mars Special Aspects",
            "Jupiter Special Aspects",
            "Saturn Special Aspects",
            "Rahu Special Aspects",
            "Ketu Special Aspects"
        ];

        const sortedAspects = [...window.HARD_CODED_ASPECTS].sort((a, b) => {
            let idxA = groupOrder.indexOf(a.group);
            let idxB = groupOrder.indexOf(b.group);
            if (idxA === -1) idxA = 99;
            if (idxB === -1) idxB = 99;
            return idxA - idxB;
        });

        state.aspectTimeouts = [];
        sortedAspects.forEach((aspect, idx) => {
            const t = setTimeout(() => {
                if (state.currentMode === "aspect" && document.getElementById('aspectArcs')) {
                    createAspectArc(aspect, gArcs);
                    applyAspectFilterStyles();
                }
            }, idx * 50);
            state.aspectTimeouts.push(t);
        });
    }

    function redrawAspectArcs() {
        const gArcs = document.getElementById('aspectArcs');
        if (!gArcs) return;
        
        const elements = gArcs.querySelectorAll('.aspectArc, .aspectFanout, .aspectFlare');
        elements.forEach(p => p.remove());
        
        if (window.HARD_CODED_ASPECTS) {
            window.HARD_CODED_ASPECTS.forEach(aspect => {
                createAspectArc(aspect, gArcs);
            });
        }
        applyAspectFilterStyles();
    }

    function focusAspect(aspectId) {
        if (state.lockedAspectId === aspectId) {
            unlockAspect();
            return;
        }
        
        state.lockedAspectId = aspectId;
        const aspect = window.HARD_CODED_ASPECTS.find(a => a.id === aspectId);
        if (!aspect) return;
        
        highlightAspectContext(aspect);
        
        applyAspectFilterStyles();
        
        showAspectExplanationInCard(aspect);
    }
    
    function unlockAspect() {
        state.lockedAspectId = null;
        clearAspectContext();
        
        document.querySelectorAll('.aspectArc').forEach(a => {
            a.classList.remove('locked-active');
        });
        
        applyAspectFilterStyles();
        card.classList.remove('show');
    }

    function hexToRgb(hex) {
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : "127, 255, 242";
    }

    function showAspectExplanationInCard(aspect) {
        cardGlyph.textContent = "☄";
        cardGlyph.style.setProperty('--c', aspect.color);
        cardGlyph.style.setProperty('--g', `rgba(${hexToRgb(aspect.color)}, 0.6)`);
        
        cardTitle.textContent = aspect.label;
        cardMeta.textContent = `${aspect.aspectKind.toUpperCase()} aspect · Strength ${aspect.strength} · Target H${aspect.targetHouse}`;
        cardMeaning.textContent = aspect.description;
        
        askOracleBtn.setAttribute("data-target", aspect.label);
        
        const chipsContainer = document.getElementById("cardChips");
        if (chipsContainer) {
            chipsContainer.innerHTML = "";
            
            const fromChip = document.createElement("button");
            fromChip.className = "cardChip";
            fromChip.textContent = `From: ${aspect.from}`;
            fromChip.addEventListener("click", (e) => {
                e.stopPropagation();
                focusGraha(aspect.from);
            });
            chipsContainer.appendChild(fromChip);
            
            const targetChip = document.createElement("button");
            targetChip.className = "cardChip";
            if (aspect.targetType === "graha") {
                targetChip.textContent = `To: ${aspect.to}`;
                targetChip.addEventListener("click", (e) => {
                    e.stopPropagation();
                    focusGraha(aspect.to);
                });
            } else {
                targetChip.textContent = `To House: ${aspect.targetHouse}`;
                targetChip.addEventListener("click", (e) => {
                    e.stopPropagation();
                    clearSectorHighlights();
                    highlightHouse(aspect.targetHouse);
                });
            }
            chipsContainer.appendChild(targetChip);
            
            const signChip = document.createElement("button");
            signChip.className = "cardChip";
            signChip.textContent = `Sign: ${aspect.targetSign}`;
            signChip.addEventListener("click", (e) => {
                e.stopPropagation();
                highlightRashiSector(SIGN_ORDER.indexOf(aspect.targetSign), aspect.targetSign);
            });
            chipsContainer.appendChild(signChip);
        }
        
        card.classList.add('show');
    }

    function highlightReceivingHouse(houseNumber) {
        highlightHouse(houseNumber);
        
        const portalGroup = document.querySelector(`.housePortalGroup[data-house="${houseNumber}"]`);
        if (portalGroup) {
            const portalShape = portalGroup.querySelector('.housePortalRing');
            if (portalShape) {
                portalShape.setAttribute("stroke", "#7ffff2");
                portalShape.setAttribute("fill", "rgba(127, 255, 242, 0.35)");
                portalShape.classList.add('receiving-pulse');
            }
            const label = portalGroup.querySelector('.housePortalLabel');
            if (label) label.style.opacity = "1";
        }
    }

    function highlightAspectContext(aspect) {
        clearSectorHighlightsOnly();
        clearNakshatraHighlights();
        
        // Highlight from and to elements
        document.querySelectorAll('.planet, .lagna').forEach(p => {
            const name = p.dataset.name || (p.classList.contains('lagna') ? 'Lagna' : '');
            if (name === aspect.from || (aspect.to && name === aspect.to)) {
                p.classList.remove('dim');
                p.classList.add('focused');
            } else {
                p.classList.add('dim');
                p.classList.remove('focused');
            }
        });
        chart.classList.add('has-focus');

        // Highlight receiving house and its mouth portal
        if (aspect.targetHouse) {
            highlightReceivingHouse(aspect.targetHouse);
            
            // Softly glow the planets inside that house
            const occupied = state.placements.filter(p => parseInt(p.house) === parseInt(aspect.targetHouse));
            occupied.forEach(p => {
                if (p.el) {
                    p.el.classList.remove('dim');
                    p.el.classList.add('focused');
                }
                if (p.name === "Lagna") {
                    const lagnaEl = document.querySelector('.lagna');
                    if (lagnaEl) {
                        lagnaEl.classList.remove('dim');
                        lagnaEl.classList.add('focused');
                    }
                }
            });
        }
        if (aspect.targetSign) {
            highlightRashi(aspect.targetSign);
        }

        // Apply filters to aspect lines
        applyAspectFilterStyles();
    }

    function clearAspectContext() {
        if (state.lockedAspectId) return;
        
        chart.classList.remove('has-focus');
        document.querySelectorAll('.planet, .lagna').forEach(p => {
            p.classList.remove('dim', 'focused');
        });
        
        applyAspectFilterStyles();
        
        document.querySelectorAll('.housePortalGroup').forEach(pg => {
            const portalShape = pg.querySelector('.housePortalRing');
            const h = pg.getAttribute('data-house');
            const occupied = state.placements.filter(p => parseInt(p.house) === parseInt(h));
            const isEmpty = occupied.length === 0;
            
            if (portalShape) {
                portalShape.setAttribute("stroke", isEmpty ? "rgba(127, 255, 242, 0.4)" : "rgba(127, 255, 242, 0.35)");
                portalShape.setAttribute("fill", isEmpty ? "none" : "rgba(9, 5, 22, 0.6)");
                portalShape.classList.remove('receiving-pulse');
                if (!isEmpty) {
                    portalShape.setAttribute("r", "5");
                }
            }
            const label = pg.querySelector('.housePortalLabel');
            if (label) label.style.opacity = "0";
        });
        
        clearSectorHighlightsOnly();
    }

    function showAspectTooltip(aspect, e) {
        let tooltip = document.getElementById('aspectTooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'aspectTooltip';
            tooltip.className = 'aspectTooltip';
            document.body.appendChild(tooltip);
        }
        
        let title = aspect.label;
        let subtitle = aspect.description;
        
        if (aspect.aspectKind !== "conjunction") {
            const h = aspect.targetHouse;
            const sign = aspect.targetSign;
            title = `${aspect.from} ${aspect.aspectKind} dṛṣṭi → ${h}th House (${sign})`;
            
            const occupied = state.placements.filter(p => parseInt(p.house) === parseInt(h));
            if (occupied.length > 0) {
                subtitle = `Received by ${occupied.map(p => p.name).join(', ')}<br/><span style="color:#aaa; font-size:10px; margin-top:2px; display:block;">${aspect.description}</span>`;
            }
        }
        
        tooltip.innerHTML = `<strong>${title}</strong><div style="font-size:11px; margin-top:4px;">${subtitle}</div>`;
        tooltip.style.left = `${e.clientX + 14}px`;
        tooltip.style.top = `${e.clientY + 14}px`;
        tooltip.classList.add('show');
    }

    function drawSectorsInSvg() {
        const svg = document.getElementById('chartOverlay');
        let gSectors = document.getElementById('chartSectors');
        if (!gSectors) {
            gSectors = document.createElementNS("http://www.w3.org/2000/svg", "g");
            gSectors.setAttribute("id", "chartSectors");
            const focusW = document.getElementById('focusWedges');
            svg.insertBefore(gSectors, focusW);
        } else {
            gSectors.innerHTML = '';
        }

        // Draw 12 Rashi sectors (from r=240 to r=368 in 800x800 space)
        for (let i = 0; i < 12; i++) {
            const deg = i * 30;
            const a = (deg - 90) * Math.PI / 180;
            const x1 = 400 + Math.cos(a) * 240;
            const y1 = 400 + Math.sin(a) * 240;
            const x2 = 400 + Math.cos(a) * 368;
            const y2 = 400 + Math.sin(a) * 368;

            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);
            line.setAttribute("class", "rashi-sector-line");
            gSectors.appendChild(line);
        }

        // Draw 27 Nakshatra sectors (from r=344 to r=368)
        const nakSize = 360 / 27;
        for (let i = 0; i < 27; i++) {
            const deg = i * nakSize;
            const a = (deg - 90) * Math.PI / 180;
            const x1 = 400 + Math.cos(a) * 344;
            const y1 = 400 + Math.sin(a) * 344;
            const x2 = 400 + Math.cos(a) * 368;
            const y2 = 400 + Math.sin(a) * 368;

            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);
            line.setAttribute("class", "nakshatra-sector-line");
            gSectors.appendChild(line);
        }
    }

    function buildChart(isResize = false) {
        // Clear previously generated labels and planet elements to allow clean recalculation
        document.querySelectorAll('.rashiLabel, .houseLabel, .nakLabel, .planet').forEach(el => el.remove());
        const nodeAxis = document.getElementById('nodeAxis');
        if (nodeAxis) nodeAxis.classList.remove('on');

        // Hard repair bridge: dummy data and real API data become the same visual schema.
        state.placements = state.placements.map(normalizePlacement).filter(Boolean);

        console.table(state.placements.map(p => ({
            name: p.name,
            absolute_longitude: p.absolute_longitude,
            degree: p.degree,
            sign_degree: p.sign_degree,
            sign: p.sign,
            house: p.house,
            nakshatra: p.nakshatra,
            pada: p.pada
        })));

        console.table(state.placements.map(p => ({
            name: p.name,
            lon: p.absolute_longitude,
            house: p.house,
            staggerRadius: p.staggerRadius
        })));

        chart.dataset.built = '1';

        // 0. Reveal birthplace observer label and fade after 4.5s
        const obsLabel = document.getElementById('observerLabel');
        if (obsLabel && !isResize) {
            const placeVal = document.getElementById('place').value || 'Kathmandu, Nepal';
            obsLabel.textContent = `Observer Point · ${placeVal}`;
            obsLabel.classList.add('show');
            setTimeout(() => {
                obsLabel.classList.remove('show');
            }, 4500);
        }

        // 1. Render Sign background wedges in SVG
        renderSectorWedges();
        drawSectorsInSvg();

        // Stagger show SVG concentric rings
        const rings = document.querySelectorAll(".svg-ring");
        rings.forEach((ring, idx) => {
            if (isResize) {
                ring.style.transition = 'none';
                ring.style.opacity = 1;
            } else {
                ring.style.opacity = 0;
                ring.style.transition = `opacity 1.5s cubic-bezier(0.1, 0.8, 0.2, 1) ${idx * 160}ms`;
                setTimeout(() => { ring.style.opacity = 1; }, 50);
            }
        });

        // 2. Draw 12 Rashi labels & house labels
        for (let i = 0; i < 12; i++) {
            // Rashi label positioned at r = 0.405 (centered inside rashiR-nakshatraR zone)
            const p = localXY(i * 30 + 15, 0.405);
            const l = document.createElement('div');
            l.className = 'rashiLabel';
            l.textContent = rashis[i];
            l.style.left = p.x + '%';
            l.style.top = p.y + '%';
            
            if (isResize) {
                l.style.transition = 'none';
                l.style.opacity = state.currentMode === 'nak' ? 0.12 : 1;
            } else {
                l.style.opacity = 0;
                l.style.transition = `opacity 1.2s ease ${800 + i * 40}ms`;
                setTimeout(() => { l.style.opacity = 1; }, 50);
            }
            
            // Radial rotation with right-side-up flip
            const angle = i * 30 + 15;
            let rot = angle - 90;
            rot = ((rot + 180) % 360 + 360) % 360 - 180;
            if (rot > 90 || rot < -90) {
                rot += 180;
            }
            l.style.setProperty('--rot', `${rot}deg`);
            
            chart.appendChild(l);
            
            l.addEventListener("click", () => {
                highlightRashiSector(i, rashis[i]);
            });

            // House label positioned at r = 0.34 (centered inside houseR-rashiR zone)
            const houseNum = houseForSignIndex(i);
            const hPos = localXY(i * 30 + 15, 0.34);
            const hl = document.createElement('div');
            hl.className = 'houseLabel';
            hl.dataset.house = houseNum;
            hl.dataset.sign = rashis[i];
            hl.textContent = `H${houseNum}`;
            hl.style.left = hPos.x + '%';
            hl.style.top = hPos.y + '%';
            
            if (isResize) {
                hl.style.transition = 'none';
                hl.style.opacity = 0.4;
            } else {
                hl.style.opacity = 0;
                hl.style.transition = `opacity 1.2s ease ${850 + i * 40}ms`;
                setTimeout(() => { hl.style.opacity = 0.4; }, 50);
            }
            chart.appendChild(hl);
        }

        // 3. Render all 27 Nakshatra labels around the chart
        renderNakshatraLabels(state.currentMode === 'nak' ? 'all' : 'default');
        if (state.currentMode === 'nak') {
            document.querySelectorAll('.rashiLabel').forEach(l => l.style.opacity = '0.12');
        }

        // Resolve staggering coordinates for close planets (matches orbitR to houseR planet zone)
        state.placements.forEach(p => {
            p.staggerRadius = (p.name === 'Lagna') ? 0.25 : 
                              (p.name === 'Rahu' || p.name === 'Ketu') ? 0.27 : 0.29;
            p.labelOffsetY = 0;
        });

        const sortedPlacements = [...state.placements].sort((a, b) => a.absolute_longitude - b.absolute_longitude);
        for (let i = 0; i < sortedPlacements.length; i++) {
            let staggerCount = 0;
            for (let j = i - 1; j >= 0; j--) {
                const p1 = sortedPlacements[j];
                const p2 = sortedPlacements[i];
                const diff = Math.abs(p1.absolute_longitude - p2.absolute_longitude);
                const angularDistance = diff > 180 ? 360 - diff : diff;
                
                if (angularDistance < 8 && Math.abs(p1.staggerRadius - p2.staggerRadius) < 0.01) {
                    staggerCount++;
                    p2.staggerRadius -= 0.02 * staggerCount; // stagger inward
                    if (p2.staggerRadius < 0.24) p2.staggerRadius = 0.24; // cap at 0.24 orbit boundary
                    p2.labelOffsetY = 14 * staggerCount;
                }
            }
        }

        // Calculate current timeline transit offset angle if active
        let offsetAngle = 0;
        if (state.currentMode === "transit") {
            const knob = document.querySelector('.knob');
            if (knob) {
                const knobLeft = parseFloat(knob.style.left) || 38;
                offsetAngle = (knobLeft / 100 - 0.38) * 60;
            }
        }

        // 4. Position Lagna dynamically
        const lagna = state.placements.find(g => g.name === "Lagna");
        if (lagna) {
            const lagnaEl = document.querySelector('.lagna');
            if (lagnaEl) {
                const p = localXY(lagna.absolute_longitude, lagna.staggerRadius || 0.25);
                lagnaEl.style.left = p.x + '%';
                lagnaEl.style.top = p.y + '%';
                
                if (isResize) {
                    lagnaEl.style.transition = 'none';
                    lagnaEl.style.opacity = 1;
                    lagnaEl.style.transform = 'translate(-50%, -50%) scale(1)';
                } else {
                    lagnaEl.style.opacity = 0;
                    lagnaEl.style.transform = 'translate(-50%, -50%) scale(0.5)';
                    lagnaEl.style.transition = `left 1.7s cubic-bezier(.16,.86,.22,1), top 1.7s cubic-bezier(.16,.86,.22,1), transform 1.5s cubic-bezier(0.16, 1, 0.3, 1) 1500ms, opacity 1.5s ease 1500ms`;
                    setTimeout(() => {
                        lagnaEl.style.opacity = 1;
                        lagnaEl.style.transform = 'translate(-50%, -50%) scale(1)';
                    }, 100);
                }
                
                lagna.el = lagnaEl;

                if (!lagnaEl.dataset.listened) {
                    lagnaEl.dataset.listened = '1';
                    lagnaEl.addEventListener('mouseenter', () => {
                        showCard(lagna);
                        highlightGrahaContext(lagna);
                    });
                    lagnaEl.addEventListener('mouseleave', () => {
                        clearGrahaContext();
                    });
                    lagnaEl.addEventListener('click', () => {
                        focusGraha("Lagna");
                    });
                }
            }
        }

        // 5. Place Planets dynamically
        const planetsData = state.placements.filter(g => g.name !== "Lagna");
        planetsData.forEach((g, idx) => {
            const el = document.createElement('div');
            el.className = 'planet';
            el.dataset.name = g.name;
            
            // Set custom colors
            const info = GRAHA_COLORS[g.name] || { color: g.color, glow: g.glow };
            el.style.setProperty('--c', info.color);
            el.style.setProperty('--g', info.glow);

            // Nested body wrapper for wobble/shimmer
            const body = document.createElement('div');
            body.className = 'graha-body';
            el.appendChild(body);

            // Ripple
            const rip = document.createElement('div');
            rip.className = 'graha-ripple';
            body.appendChild(rip);

            // Halo
            const halo = document.createElement('div');
            halo.className = 'graha-halo';
            body.appendChild(halo);

            // Orb
            const orb = document.createElement('div');
            orb.className = 'graha-orb';
            body.appendChild(orb);

            // Glyph
            const glyph = document.createElement('div');
            glyph.className = 'graha-glyph';
            glyph.textContent = g.glyph;
            body.appendChild(glyph);

            // Outward name label
            const nameLabel = document.createElement('div');
            nameLabel.className = 'graha-label';
            nameLabel.textContent = g.name;
            body.appendChild(nameLabel);

            // Outward vector translation for label to avoid overlaps
            const targetAngle = g.name === "Lagna" ? g.absolute_longitude : g.absolute_longitude + offsetAngle;
            const aRad = (targetAngle - 90) * Math.PI / 180;
            const labelDist = 24 + (g.labelOffsetY || 0);
            const offsetX = Math.cos(aRad) * labelDist;
            const offsetY = Math.sin(aRad) * labelDist;
            nameLabel.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;

            chart.appendChild(el);
            g.el = el;

            el.addEventListener('mouseenter', () => {
                showCard(g);
                highlightGrahaContext(g);
            });
            el.addEventListener('mouseleave', () => {
                clearGrahaContext();
            });
            el.addEventListener('click', () => {
                focusGraha(g.name);
            });

            if (isResize) {
                el.style.transition = 'none';
                const r = g.staggerRadius || 0.29;
                const p = localXY(targetAngle, r);
                el.style.left = p.x + '%';
                el.style.top = p.y + '%';
                el.style.opacity = 1;
                el.style.transform = 'translate(-50%, -50%) scale(1)';
            } else {
                // Start coordinates in outer space bounds
                const startAngle = g.absolute_longitude + (Math.random() * 120 - 60);
                const startRadius = 1.35 + Math.random() * 0.45;
                const start = localXY(startAngle, startRadius);
                el.style.left = start.x + '%';
                el.style.top = start.y + '%';
                el.style.opacity = 0;
                el.style.transform = 'translate(-50%, -50%) scale(0.3)';
                el.style.transition = `left 2.2s cubic-bezier(0.16, 1, 0.3, 1) ${400 + idx * 150}ms, 
                                       top 2.2s cubic-bezier(0.16, 1, 0.3, 1) ${400 + idx * 150}ms, 
                                       opacity 1.8s ease ${400 + idx * 150}ms, 
                                       transform 1.8s ease ${400 + idx * 150}ms`;

                setTimeout(() => {
                    const r = g.staggerRadius || 0.29;
                    const p = localXY(targetAngle, r);
                    el.style.left = p.x + '%';
                    el.style.top = p.y + '%';
                    el.style.opacity = 1;
                    el.style.transform = 'translate(-50%, -50%) scale(1)';
                }, 100);
            }
        });

        // 6. Node Axis
        const rahu = state.placements.find(p => p.name === 'Rahu');
        if (rahu) {
            const axis = document.getElementById('nodeAxis');
            axis.style.transform = `translate(-50%,-50%) rotate(${rahu.absolute_longitude + offsetAngle}deg)`;
            axis.classList.add('on');
        }
    }


    // --- Unified Hover & Click Visual Context ---
    function highlightGrahaContext(g) {
        clearSectorHighlightsOnly();
        clearNakshatraHighlights();
        
        if (state.currentMode !== 'aspect') {
            clearAspectArcs();
        } else {
            state.hoveredGraha = g.name;
            applyAspectFilterStyles();

            // Highlight target houses and target grahas
            const activeAspects = getPlanetFocusedAspects(g.name);
            const targetHouses = new Set();
            const targetGrahas = new Set();
            
            activeAspects.forEach(a => {
                if (a.targetHouse) targetHouses.add(parseInt(a.targetHouse));
                if (a.to && a.targetType === "graha") targetGrahas.add(a.to);
            });
            
            // Add occupied grahas in those houses
            state.placements.forEach(p => {
                if (targetHouses.has(parseInt(p.house))) {
                    targetGrahas.add(p.name);
                }
            });

            // Glow target house portals
            document.querySelectorAll('.housePortalGroup').forEach(pg => {
                const houseNum = parseInt(pg.getAttribute('data-house'));
                const portalShape = pg.querySelector('.housePortalRing');
                const label = pg.querySelector('.housePortalLabel');
                
                if (targetHouses.has(houseNum)) {
                    highlightReceivingHouse(houseNum);
                } else {
                    const occupied = state.placements.filter(p => parseInt(p.house) === houseNum);
                    const isEmpty = occupied.length === 0;
                    if (portalShape) {
                        portalShape.setAttribute("stroke", isEmpty ? "rgba(127, 255, 242, 0.4)" : "rgba(127, 255, 242, 0.35)");
                        portalShape.setAttribute("fill", isEmpty ? "none" : "rgba(9, 5, 22, 0.6)");
                        portalShape.classList.remove('receiving-pulse');
                        if (!isEmpty) portalShape.setAttribute("r", "5");
                    }
                    if (label) label.style.opacity = "0";
                }
            });
        }

        // 1. Highlight Rashi sign sector
        const rashiIndex = SIGN_ORDER.indexOf(g.sign);
        if (rashiIndex !== -1) {
            highlightRashi(g.sign);
        }

        // 2. Highlight house
        highlightHouse(g.house);

        // 3. Highlight nakshatra
        highlightNakshatra(g.nakshatra);

        // 4. Dim other planets, focus selected node
        if (state.currentMode === 'aspect') {
            const activeAspects = getPlanetFocusedAspects(g.name);
            const targetHouses = new Set();
            const targetGrahas = new Set();
            
            activeAspects.forEach(a => {
                if (a.targetHouse) targetHouses.add(parseInt(a.targetHouse));
                if (a.to && a.targetType === "graha") targetGrahas.add(a.to);
            });
            
            state.placements.forEach(p => {
                if (targetHouses.has(parseInt(p.house))) {
                    targetGrahas.add(p.name);
                }
            });

            document.querySelectorAll('.planet, .lagna').forEach(p => {
                const name = p.dataset.name || (p.classList.contains('lagna') ? 'Lagna' : '');
                if (name === g.name || targetGrahas.has(name)) {
                    p.classList.remove('dim');
                    p.classList.add('focused');
                } else {
                    p.classList.add('dim');
                    p.classList.remove('focused');
                }
            });
        } else {
            document.querySelectorAll('.planet, .lagna').forEach(p => {
                p.classList.add('dim');
                p.classList.remove('focused');
            });
            if (g.el) {
                g.el.classList.remove('dim');
                g.el.classList.add('focused');
            }
        }
        chart.classList.add('has-focus');

        // 5. Connect soft glow planets
        let connectedNames = [];
        if (g.name === 'Rahu') {
            connectedNames = ['Ketu'];
            const axis = document.getElementById('nodeAxis');
            if (axis) axis.classList.add('on');
        }
        else if (g.name === 'Ketu') {
            connectedNames = ['Rahu'];
            const axis = document.getElementById('nodeAxis');
            if (axis) axis.classList.add('on');
        }
        else {
            const sameHouse = state.placements.filter(p => parseInt(p.house) === parseInt(g.house) && p.name !== g.name);
            connectedNames = sameHouse.map(p => p.name);
        }

        connectedNames.forEach(cName => {
            if (cName === 'Lagna') {
                const lagnaEl = document.querySelector('.lagna');
                if (lagnaEl) {
                    lagnaEl.classList.remove('dim');
                    lagnaEl.classList.add('focused');
                }
            } else {
                const pObj = state.placements.find(x => x.name === cName);
                if (pObj && pObj.el) {
                    pObj.el.classList.remove('dim');
                    pObj.el.classList.add('focused');
                }
            }
        });
    }

    function clearGrahaContext() {
        state.hoveredGraha = null;
        if (state.focusedGraha) {
            const g = state.placements.find(x => x.name.toLowerCase() === state.focusedGraha.toLowerCase());
            if (g) {
                highlightGrahaContext(g);
                return;
            }
        }
        
        chart.classList.remove('has-focus');

        document.querySelectorAll('.planet, .lagna').forEach(p => {
            p.classList.remove('dim', 'focused');
        });

        const axis = document.getElementById('nodeAxis');
        if (axis && state.currentMode !== 'aspect') axis.classList.remove('on');

        clearSectorHighlightsOnly();
        clearNakshatraHighlights();
        
        if (state.currentMode === 'aspect') {
            clearAspectContext();
        } else {
            clearAspectArcs();
        }
    }

    // --- Visual Focus Engine ---
    function resetFocus() {
        state.focusedGraha = null;
        state.axisFlowAngle = null;
        state.lockedAspectId = null;
        state.hoveredGraha = null;
        
        if (state.currentMode === 'aspect') {
            state.aspectFilter = 'core';
            document.querySelectorAll('#aspectFilters .filter-chip').forEach(c => {
                if (c.getAttribute('data-filter') === 'core') {
                    c.classList.add('active');
                } else {
                    c.classList.remove('active');
                }
            });
        }
        
        clearGrahaContext();

        // Restore label highlights
        document.querySelectorAll('.rashiLabel').forEach(l => {
            l.style.opacity = '1';
            l.style.filter = 'none';
            l.style.color = '';
        });
        document.querySelectorAll('.nakLabel').forEach(l => {
            l.style.opacity = '';
            l.style.color = '';
            l.style.fontSize = '';
            l.classList.remove('bright');
        });
        document.querySelectorAll('.houseLabel').forEach(l => {
            l.classList.remove('bright');
        });

        // Hide nakshatra summary panel
        if (nakSummary) {
            nakSummary.classList.remove("visible");
            nakSummary.classList.add("hidden");
        }

        // Reset timeline slider state
        timeline.classList.remove('on');

        // Reset switcher active styles
        document.querySelectorAll('.modeBtn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-mode="chart"]').classList.add('active');

        // Reset Oracle Focus Header
        updateOracleFocusHeader("Rāśi Mandala", "");

        status.innerHTML = '<b>Birth Sky</b><br/>Rāśi mandala is open. Hover grahas, use focus controls, or ask the oracle.';
    }

    function focusGraha(name) {
        const g = state.placements.find(x => x.name.toLowerCase() === name.toLowerCase());
        if (!g) return;
        resetFocus();

        state.focusedGraha = g.name;

        if (state.currentMode === 'aspect') {
            state.aspectFilter = 'focused';
            document.querySelectorAll('#aspectFilters .filter-chip').forEach(c => {
                if (c.getAttribute('data-filter') === 'focused') {
                    c.classList.add('active');
                } else {
                    c.classList.remove('active');
                }
            });
        }

        // Run the unified highlight context
        highlightGrahaContext(g);

        // Show detail card
        showCard(g);

        // Axis flow settings for Rahu-Ketu
        if (g.name === "Rahu" || g.name === "Ketu") {
            const rahu = state.placements.find(x => x.name === "Rahu");
            const lon = rahu ? rahu.absolute_longitude : 348;
            state.axisFlowAngle = (lon - 90) * Math.PI / 180;
        } else {
            state.axisFlowAngle = null;
        }

        status.innerHTML = `<b>${g.name} Focus</b><br/>${g.sign} (${g.rashi}), ${g.nakshatra} Pada ${g.pada}, House ${g.house}. ${g.interpretation}`;
        addAI(`Focus locked on <b>${g.name}</b>. ${g.interpretation}`);
    }

    function focusCluster(type) {
        resetFocus();

        // 12th House Cluster (Dynamic)
        if (type === "12th") {
            const occupied = state.placements.filter(p => parseInt(p.house) === 12);
            const cluster = occupied.map(p => p.name);
            
            chart.classList.add('has-focus');
            document.querySelectorAll('.planet, .lagna').forEach(p => p.classList.add('dim'));
            
            cluster.forEach(name => {
                const g = state.placements.find(x => x.name === name);
                if (g && g.el) {
                    g.el.classList.remove('dim');
                    g.el.classList.add('focused');
                }
            });

            const house12Sign = SIGN_ORDER[signIndexForHouse(12)];
            highlightRashi(house12Sign);
            highlightHouse(12);

            // Draw aspect arcs within cluster
            const pairs = [];
            for (let i = 0; i < cluster.length; i++) {
                for (let j = i + 1; j < cluster.length; j++) {
                    pairs.push([cluster[i], cluster[j]]);
                }
            }
            if (pairs.length > 0) {
                drawAspectArcs(pairs);
            }

            const planetListStr = cluster.length > 0 ? cluster.join(" · ") : "No planets";
            updateOracleFocusHeader("12th House Focus", `${planetListStr} in ${house12Sign}`);
            status.innerHTML = `<b>12th House Focus</b><br/>${planetListStr} in ${house12Sign}. Wedges outline the 12th house.`;
            addAI(`12th House highlighted. Contains: ${planetListStr || "no planets"}. The 12th house governs spiritual retreat, solitude, and foreign horizons.`);
        }
        // Moon-Saturn Cluster
        else if (type === "MoonSaturn") {
            const moon = state.placements.find(x => x.name === "Moon");
            const saturn = state.placements.find(x => x.name === "Saturn");
            
            if (moon && saturn) {
                const sameHouse = parseInt(moon.house) === parseInt(saturn.house);
                const rashi = moon.sign;
                const houseNum = moon.house;
                
                chart.classList.add('has-focus');
                document.querySelectorAll('.planet, .lagna').forEach(p => p.classList.add('dim'));
                
                [moon, saturn].forEach(g => {
                    if (g.el) {
                        g.el.classList.remove('dim');
                        g.el.classList.add('focused');
                    }
                });

                highlightRashi(rashi);
                highlightHouse(houseNum);
                if (moon.nakshatra === saturn.nakshatra) {
                    highlightNakshatra(moon.nakshatra);
                }

                // Draw a connection arc
                drawAspectArcs([['Moon', 'Saturn']]);

                updateOracleFocusHeader("Moon & Saturn Alignment", `${rashi} · House ${houseNum}`);
                status.innerHTML = `<b>Moon-Saturn Alignment</b><br/>Emotional field and serious duty align in ${rashi} House ${houseNum}.`;
                addAI(`Moon-Saturn alignment activated in ${rashi} House ${houseNum}. Saturn structures the Moon's receptive emotional landscape.`);
            }
        }
    }

    function setMode(mode) {
        state.currentMode = mode;
        
        const filtersPanel = document.getElementById('aspectFilters');
        if (filtersPanel) {
            if (mode === 'aspect') {
                filtersPanel.classList.add('on');
            } else {
                filtersPanel.classList.remove('on');
            }
        }
        
        // Update switcher buttons
        document.querySelectorAll('.modeBtn').forEach(b => {
            if (b.getAttribute("data-mode") === mode) {
                b.classList.add("active");
            } else {
                b.classList.remove("active");
            }
        });

        // Reset default states
        resetFocus();

        // If not transit mode, reset timeline slider knob and restore natal planet positions
        if (mode !== "transit") {
            const knob = document.querySelector('.knob');
            if (knob) {
                knob.style.left = '38%'; // natal position
            }
            state.placements.forEach(g => {
                if (g.el) {
                    const r = g.staggerRadius || 0.275;
                    const p = localXY(g.absolute_longitude, r);
                    g.el.style.left = p.x + '%';
                    g.el.style.top = p.y + '%';
                }
            });
            const lagna = state.placements.find(g => g.name === "Lagna");
            if (lagna && lagna.el) {
                const p = localXY(lagna.absolute_longitude, lagna.staggerRadius || 0.22);
                lagna.el.style.left = p.x + '%';
                lagna.el.style.top = p.y + '%';
            }
            const rahu = state.placements.find(p => p.name === 'Rahu');
            if (rahu) {
                const axis = document.getElementById('nodeAxis');
                if (axis) {
                    axis.style.transform = `translate(-50%,-50%) rotate(${rahu.absolute_longitude}deg)`;
                }
            }
        }

        // Mode specific configurations
        if (mode === "chart") {
            // default chart mode
        } 
        // MODE 5: Nakshatra Mode
        else if (mode === "nak") {
            document.querySelector('[data-mode="nak"]').classList.add('active');
            
            // Render all 27 nakshatras and fade Rashi labels
            renderNakshatraLabels('all');
            document.querySelectorAll('.rashiLabel').forEach(l => l.style.opacity = '0.12');

            // Populate and slide out Nakshatra Summary list panel
            populateNakSummary();
            nakSummary.classList.remove("hidden");
            setTimeout(() => nakSummary.classList.add("visible"), 50);

            updateOracleFocusHeader("Nakshatra Division Map", "27 Stellar Mansions");
            status.innerHTML = '<b>Nakshatra Mode</b><br/>Emphasizing 27 lunar mansions and computed placements. Review stellar coordinates list.';
            addAI('Nakshatra mode opened. In this mode, the stellar divisions guide the interpretation path.');
        } 
        // MODE 6: Aspect Mode
        else if (mode === "aspect") {
            document.querySelector('[data-mode="aspect"]').classList.add('active');
            
            const filtersPanel = document.getElementById('aspectFilters');
            if (filtersPanel) {
                filtersPanel.classList.add('on');
                document.querySelectorAll('#aspectFilters .filter-chip').forEach(c => {
                    if (c.getAttribute('data-filter') === 'core') {
                        c.classList.add('active');
                    } else {
                        c.classList.remove('active');
                    }
                });
            }
            state.aspectFilter = 'core';

            // Draw aspect Bezier arcs sequentially
            drawAspectArcsSequentially();

            updateOracleFocusHeader("Aspect Lines Map", "Dṛṣṭi Coordinate Links");
            status.innerHTML = '<b>Aspect Mode</b><br/>Luminous aspects draw coordinates connections between grahas.';
        } 
        else if (mode === "transit") {
            timeline.classList.add('on');
            document.querySelector('[data-mode="transit"]').classList.add('active');
            updateOracleFocusHeader("Gochar Timeline stream", "natal vs Transit coordinates");
            status.innerHTML = '<b>Gochar Mode</b><br/>Drag timeline knob to simulate transits and observe planets offset orbits.';
            addAI('Gochar Timeline opened. natal sky is shifting. Drag the slider to observe planets orbit offset transits.');
        } 
        else if (mode === "dasha") {
            document.querySelector('[data-mode="dasha"]').classList.add('active');
            updateOracleFocusHeader("Vimshottari Dasha stream", "Time-river karmic cycles");
            status.innerHTML = '<b>Dasha Mode</b><br/>Vimshottari timelines unfold. Saturn active Mahadasha (2026 - 2045).';
            addAI('Dasha mode opened. Unfolding chronological cycles.');
        }
    }

    // Dynamic highlight helpers
    function highlightSector(startAngle, endAngle, rInner, rOuter, wedgeClass) {
        const g = document.getElementById("focusWedges");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", `focusWedge ${wedgeClass}`);
        path.setAttribute("d", createWedgePath(400, 400, rInner, rOuter, startAngle, endAngle));
        g.appendChild(path);
    }

    function highlightNakshatraWedge(startAngle, endAngle, wedgeClass) {
        // Nakshatra ring spans radius 360 to 396
        highlightSector(startAngle, endAngle, 360, 396, wedgeClass);
    }

    function clearWedges() {
        const g = document.getElementById("focusWedges");
        if (g) g.innerHTML = "";
    }



    function updateOracleFocusHeader(title, subtitle) {
        const header = document.getElementById("commandHead");
        if (header) {
            header.querySelector("b").textContent = title;
            document.getElementById("commandSub").textContent = subtitle || "chat-guided focus";
        }
    }

    // Populate Nakshatra Summary list panel
    function populateNakSummary() {
        nakSummaryList.innerHTML = "";
        state.placements.forEach(g => {
            const item = document.createElement("div");
            item.className = "nakSummaryItem";
            item.innerHTML = `
                <div class="nakItemName">
                    <span style="color: ${g.color};">${g.glyph}</span>
                    <span>${g.name}</span>
                </div>
                <div class="nakItemValue">
                    ${g.nakshatra} (P${g.pada})
                </div>
            `;
            item.addEventListener("click", () => {
                focusGraha(g.name);
            });
            nakSummaryList.appendChild(item);
        });
    }

    // Hover Rashi sector text interaction
    function highlightRashiSector(index, name) {
        resetFocus();
        
        const rashiDivs = document.querySelectorAll('.sector');
        const rashiLbls = document.querySelectorAll('.rashiLabel');
        const allGrahas = document.querySelectorAll('.planet');

        rashiDivs.forEach((el, idx) => {
            if (idx === index) {
                el.style.opacity = '1';
                el.style.background = 'linear-gradient(to top, rgba(244,201,120,.8), rgba(244,201,120,0))';
            } else {
                el.style.opacity = '0.08';
            }
        });

        rashiLbls.forEach((el, idx) => {
            if (idx === index) {
                el.style.opacity = '1';
                el.style.filter = 'drop-shadow(0 0 10px var(--gold))';
            } else {
                el.style.opacity = '0.12';
            }
        });

        const signName = SIGN_ORDER[index];
        state.placements.forEach(g => {
            if (g.el) {
                if (g.sign !== signName) {
                    g.el.classList.add("dim");
                } else {
                    g.el.classList.add("focused");
                }
            }
        });

        // Inject highlight wedge into SVG
        highlightSector(index * 30, (index + 1) * 30, 250, 396, "gold-violet");

        appendOracleMessage("oracle", `Analyzing Rāśi sector: ${name} (${signName}). Directing energy bounds.`);
    }


    // --- Drag-based Interactive Transit timeline ---
    const knob = document.querySelector('.knob');
    const track = document.querySelector('.track');
    let isDragging = false;

    track.addEventListener('mousedown', (e) => {
        isDragging = true;
        updateKnob(e);
    });

    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            updateKnob(e);
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    function updateKnob(e) {
        const rect = track.getBoundingClientRect();
        let pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        knob.style.left = (pct * 100) + '%';
        
        // Rotate planets slightly based on pct to simulate transit movement
        const offsetAngle = (pct - 0.38) * 60; // 38% is natal base position
        const planetsData = state.placements.filter(p => p.name !== "Lagna");
        
        planetsData.forEach((g, idx) => {
            if (g.el) {
                const r = g.staggerRadius || ((g.name === 'Rahu' || g.name === 'Ketu') ? 0.25 : 0.275);
                const p = localXY(g.absolute_longitude + offsetAngle, r);
                g.el.style.left = p.x + '%';
                g.el.style.top = p.y + '%';
            }
        });
        
        const rahu = state.placements.find(p => p.name === 'Rahu');
        if (rahu) {
            const axis = document.getElementById('nodeAxis');
            axis.style.transform = `translate(-50%,-50%) rotate(${rahu.absolute_longitude + offsetAngle}deg)`;
        }

        if (document.getElementById('aspectArcs')) {
            redrawAspectArcs();
        }
        
        status.innerHTML = `<b>Gochar Stream (${Math.round(offsetAngle)}° offset)</b><br/>Adjusting timeline to simulate transit configurations. natal coordinates are shifting.`;
    }


    // --- Oracle Chat Client ---
    document.getElementById('commandHead').addEventListener('click', () => {
        command.classList.toggle('collapsed');
        if (command.classList.contains('collapsed')) {
            oraclePill.classList.remove('hidden');
        }
    });
    
    sendBtn.addEventListener('click', send);
    askInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') send();
    });

    function send() {
        const t = askInput.value.trim();
        if (!t) return;
        addYou(t);
        askInput.value = '';

        // Query backend oracle calculations
        fetch('/api/oracle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: t, placements: state.placements })
        })
        .then(res => res.json())
        .then(data => {
            addAI(data.message);
            
            // Adjust visual states
            if (data.mode) {
                if (data.mode === 'aspect') setMode('aspect');
                else if (data.mode === 'nakshatra') setMode('nak');
                else if (data.mode === 'dasha') setMode('dasha');
                else if (data.mode === 'transit' || data.mode === 'gochar') setMode('transit');
            }
            if (data.focus_target) {
                if (data.focus_target === '12th') {
                    focusCluster('12th');
                } else if (data.focus_target.toLowerCase() === 'moonsaturn') {
                    focusCluster('MoonSaturn');
                } else {
                    focusGraha(data.focus_target);
                }
            }
        })
        .catch(err => {
            console.error("Oracle API query failed:", err);
            // Local fallback matching
            const q = t.toLowerCase();
            if (q.includes('rahu')) focusGraha('Rahu');
            else if (q.includes('ketu')) focusGraha('Ketu');
            else if (q.includes('moon') && q.includes('saturn')) focusCluster('MoonSaturn');
            else if (q.includes('moon') || q.includes('mind')) focusGraha('Moon');
            else if (q.includes('saturn') || q.includes('karma')) focusGraha('Saturn');
            else if (q.includes('12th') || q.includes('twelfth')) focusCluster('12th');
            else if (q.includes('aspect')) setMode('aspect');
            else if (q.includes('transit') || q.includes('gochar')) setMode('transit');
            else if (q.includes('dasha')) setMode('dasha');
            else if (q.includes('nak')) setMode('nak');
            else addAI('I can visually focus the chart. Try: “focus Rahu,” “show aspects,” “open gochar,” “explain Moon,” or “show dasha.”');
        });
    }


    // --- Bottom Control bar switcher triggers ---
    document.querySelectorAll('.modeBtn').forEach(btn => btn.addEventListener('click', () => {
        const m = btn.dataset.mode;
        if (m === 'aspect') setMode('aspect');
        else if (m === 'transit') setMode('transit');
        else if (m === 'dasha') setMode('dasha');
        else if (m === 'nak') setMode('nak');
        else resetView();
    }));

    // --- Aspect filter chips click handlers ---
    document.querySelectorAll('#aspectFilters .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#aspectFilters .filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            
            const filter = chip.getAttribute('data-filter');
            state.aspectFilter = filter;
            
            if (filter === 'core') {
                state.focusedGraha = null;
                unlockAspect();
            } else if (filter === 'all') {
                unlockAspect();
            }
            
            applyAspectFilterStyles();
            
            if (filter === 'focused') {
                if (state.focusedGraha) {
                    const g = state.placements.find(x => x.name.toLowerCase() === state.focusedGraha.toLowerCase());
                    if (g) highlightGrahaContext(g);
                } else {
                    status.innerHTML = '<b>Selected Graha Mode</b><br/>Click on any planet in the chart to inspect its specific aspect streams.';
                    clearGrahaContext();
                }
            } else {
                if (state.focusedGraha) {
                    const g = state.placements.find(x => x.name.toLowerCase() === state.focusedGraha.toLowerCase());
                    if (g) highlightGrahaContext(g);
                } else {
                    clearGrahaContext();
                }
            }
        });
    });

    // --- Shortcuts keys ---
    document.addEventListener('keydown', e => {
        if (document.activeElement === askInput) {
            if (e.key === "Escape") {
                askInput.blur();
                resetView();
            }
            return;
        }

        if (e.key === '/') {
            e.preventDefault();
            command.classList.remove('collapsed');
            oraclePill.classList.add('hidden');
            askInput.focus();
        }
        
        if (!revealed) return;
        
        const k = e.key.toLowerCase();
        if (k === 'r') focusGraha('Rahu');
        if (k === 'm') focusGraha('Moon');
        if (k === 's') focusGraha('Saturn');
        if (k === 'a') setMode('aspect');
        if (k === 't') setMode('transit');
        if (k === 'd') setMode('dasha');
        if (k === 'n') setMode('nak');
        if (e.key === 'Escape') resetView();
    });

    function showCard(g) {
        cardGlyph.textContent = g.glyph;
        cardGlyph.style.setProperty('--c', g.color);
        cardGlyph.style.setProperty('--g', g.glow);
        
        // Title: Moon · Puṣya P2
        cardTitle.textContent = `${g.name} · ${g.nakshatra} P${g.pada}`;
        
        // Meta: Cancer/Karka · 9th House · Nak lord Saturn · 8° Cancer
        const suffixes = ["st", "nd", "rd", "th", "th", "th", "th", "th", "th", "th", "th", "th"];
        const suffix = suffixes[g.house - 1] || "th";
        const nakLord = g.nakshatra_lord || "N/A";
        cardMeta.textContent = `${g.sign}/${g.rashi} · ${g.house}${suffix} House · Nak lord ${nakLord} · ${g.degree}° ${g.sign}`;
        
        cardMeaning.textContent = g.interpretation;
        
        // Link planet target name to tooltip Ask button
        askOracleBtn.setAttribute("data-target", g.name);

        // Update context chips
        const chipsContainer = document.getElementById("cardChips");
        if (chipsContainer) {
            chipsContainer.innerHTML = "";
            
            // 1. Rāśi chip
            const rashiChip = document.createElement("button");
            rashiChip.className = "cardChip";
            rashiChip.textContent = `Rāśi: ${g.rashi}`;
            rashiChip.addEventListener("click", (e) => {
                e.stopPropagation();
                highlightRashiSector(SIGN_ORDER.indexOf(g.sign), g.rashi);
            });
            chipsContainer.appendChild(rashiChip);
            
            // 2. House chip
            const houseChip = document.createElement("button");
            houseChip.className = "cardChip";
            houseChip.textContent = `House: ${g.house}${suffix}`;
            houseChip.addEventListener("click", (e) => {
                e.stopPropagation();
                clearSectorHighlights();
                highlightHouse(g.house);
            });
            chipsContainer.appendChild(houseChip);
            
            // 3. Nakshatra chip
            const nakChip = document.createElement("button");
            nakChip.className = "cardChip";
            nakChip.textContent = `Nakshatra: ${g.nakshatra}`;
            nakChip.addEventListener("click", (e) => {
                e.stopPropagation();
                clearNakshatraHighlights();
                highlightNakshatra(g.nakshatra);
            });
            chipsContainer.appendChild(nakChip);
            
            // 4. Pada chip
            const padaChip = document.createElement("button");
            padaChip.className = "cardChip";
            padaChip.textContent = `Pada: ${g.pada}`;
            padaChip.addEventListener("click", (e) => {
                e.stopPropagation();
                clearNakshatraHighlights();
                highlightNakshatra(g.nakshatra);
            });
            chipsContainer.appendChild(padaChip);
            
            // 5. Connected chip
            let connectedName = null;
            if (g.name === 'Moon') connectedName = 'Saturn';
            else if (g.name === 'Saturn') connectedName = 'Moon';
            else if (g.name === 'Rahu') connectedName = 'Ketu';
            else if (g.name === 'Ketu') connectedName = 'Rahu';
            else if (['Sun', 'Mercury', 'Jupiter'].includes(g.name)) {
                // Return first other planet from the cluster
                const others = ['Sun', 'Mercury', 'Jupiter'].filter(x => x !== g.name);
                connectedName = others[0];
            } else if (g.name === 'Venus') connectedName = 'Lagna';
            else if (g.name === 'Lagna') connectedName = 'Venus';
            
            if (connectedName) {
                const connChip = document.createElement("button");
                connChip.className = "cardChip";
                connChip.textContent = `Connected: ${connectedName}`;
                connChip.addEventListener("click", (e) => {
                    e.stopPropagation();
                    focusGraha(connectedName);
                });
                chipsContainer.appendChild(connChip);
            }
        }
        
        card.classList.add('show');
    }

    function hideCardSoon() {
        setTimeout(() => {
            if (!document.querySelector('.planet:hover') && !card.matches(':hover')) card.classList.remove('show');
        }, 500);
    }
    document.addEventListener('mousemove', hideCardSoon);

    document.addEventListener('click', (e) => {
        if (!state.lockedAspectId) return;
        
        // If the click is on an aspect arc, inside the oracle card, or inside the oracle chat console, do not unlock
        if (e.target.closest('.aspectArc') || e.target.closest('#oracleCard') || e.target.closest('#command')) {
            return;
        }
        
        unlockAspect();
    });

    function appendOracleMessage(sender, text) {
        if (!msgs) return;
        const msgDiv = document.createElement('div');
        const cls = (sender === 'oracle') ? 'ai' : sender;
        msgDiv.className = `msg ${cls}`;
        msgDiv.innerHTML = text;
        msgs.appendChild(msgDiv);
        msgs.scrollTop = msgs.scrollHeight;
    }

    function addAI(text) {
        appendOracleMessage('ai', text);
    }

    function addYou(text) {
        appendOracleMessage('you', text);
    }

    function resetView() {
        resetFocus();
    }

    // Intro delayed greeting
    setTimeout(() => addAI('This version is intentionally full-screen: the UI disappears and the chart becomes the world.'), 1200);
});
