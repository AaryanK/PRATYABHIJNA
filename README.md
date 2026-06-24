# Pratyabhijna (प्रत्यभिज्ञा)

An immersive, Vedic-only cinematic Jyotiṣa (astrology) experience. Pratyabhijna is Sanskrit for "recognition" — the recognition of one's deeper nature through the alignment of stellar coordinates at the moment of birth.

This web application deviates from standard dashboard formats to provide an occult, cinematic, full-screen spiritual encounter centered on a circular sidereal sky mandala.

---

## 🌌 Core Features

1. **Cosmic Entry Form**: A glassmorphic entry gate asking for Date, Time, and Place of Birth to calibrate coordinates.
2. **Sequential Cinematic Reveal**:
   - Fades out birth details.
   - Triggers sequential staging chants ("Scorpio Lagna rises...", "Nakshatras calculated...", "Grahas settling...").
   - Reveals the full-screen Jyotiṣa Mandala.
3. **Cosmic Settling Transition**: On load, planetary nodes start from deep space orbits (random radii and angles) and transition smoothly (using CSS transitions) into their exact sidereal longitudes.
4. **Interactive Jyotiṣa Mandala**:
   - Displays 12 Sanskrit rāśis (Meṣa through Mīna).
   - Displays 27 stellar Nakshatras (every other labeled to maintain clean styling).
   - Draws a glowing rose Rahu-Ketu karmic axis.
   - Interactive hover cards and click-locks for planets (grahas).
   - Dynamic collision avoidance spacing for planets sharing the same sign.
5. **Six Visual Modes (Bottom Bar)**:
   - **Rāśi**: Default view showing signs and nodes.
   - **Nakshatra**: Highlights the 27 stellar divisions and dims Rashis.
   - **Rahu-Ketu**: Dims everything except the north and south node axis.
   - **Aspects**: Draws structural geometric aspects (e.g. Moon-Saturn, Sun-Mercury, etc.).
   - **Timeline**: Displays Vimshottari Dasha cycles and transits (Gochar).
   - **Table**: Shows a calculation sheet displaying raw signs, degrees, Nakshatras, Padas, lords, and chart roles.
6. **Oracle Chat**: An integrated glass panel that interprets keyboard commands or typed queries (e.g., "Moon", "Saturn", "12th", "aspects").
7. **Celestial Keyboard Shortcuts**:
   - `/`: Focus Oracle Chat
   - `M`: Focus Moon
   - `S`: Focus Saturn
   - `R`: Focus Rahu
   - `K`: Focus Ketu
   - `A`: Toggle Aspect mode
   - `N`: Toggle Nakshatra mode
   - `T`: Toggle Timeline mode
   - `Esc`: Reset focus and view modes

---

## 🛠️ Tech Stack & Requirements

- **Backend**: Python 3, Flask
- **Frontend**: Vanilla CSS, Vanilla HTML, Canvas (Animated starfield, drifting particles, breathing radial aura), SVG (Interactive charts)
- **Dependencies**: Listed in `requirements.txt` (only Flask is needed for MVP calculation mockups).

---

## 📁 Project Structure

```text
pratyabhijna/
│
├── app.py                  # Main Flask application and Oracle backend
├── requirements.txt        # Backend dependencies
├── README.md               # Documentation
│
├── pratyabhijna/
│   ├── __init__.py         # Package initialization
│   ├── data.py             # Raw placements and color/glow values
│   ├── jyotisha.py         # Nakshatra, Pada, and absolute longitude calculation math
│   └── interpretations.py  # Canned Jyotiṣa interpretations
│
├── templates/
│   └── index.html          # Main HTML structure and SVG layout
│
└── static/
    ├── css/
    │   └── style.css       # Visual system styles (glassmorphism, radial auras, glows)
    ├── js/
    │   └── app.js          # Starfield animation loop, SVG rendering, click events, hotkeys
    └── assets/             # Media and images directory (empty for now)
```

---

## 🚀 Getting Started

Ensure you have Python installed, then execute the following:

### 1. Set Up Environment & Install Dependencies

Using `pip`:
```bash
pip install -r requirements.txt
```

Or using `uv` (recommended):
```bash
uv pip install -r requirements.txt
```

### 2. Start the Server
```bash
python app.py
```

Open your browser and navigate to `http://127.0.0.1:5000/` to enter the Cosmic Gate.

---

## 🌎 3D Earth High-Quality Textures Guide

The application uses procedural textures generated dynamically via HTML5 Canvas (which runs 100% locally and offline without external asset dependencies). However, for a production-grade look, you can drop high-resolution textures into the asset directory.

### Texture Placements:
Save your texture images inside `static/assets/textures/` using the following names:
1. **Earth Map**: `earth_color.jpg` (2K/4K Equirectangular projection)
2. **Bump/Normal Map**: `earth_bump.jpg` (for continental terrain depth)
3. **Clouds Map**: `earth_clouds.png` (transparent PNG for cloud layers)
4. **Night Lights**: `earth_lights.jpg` (to add glowing cities on the dark side of the globe)

### How to Enable:
Modify `static/js/earthScene.js` inside `initEarthScene()` to replace:
```javascript
const earthTex = createProceduralEarthTexture();
```
with:
```javascript
const textureLoader = new THREE.TextureLoader();
const earthTex = textureLoader.load("/static/assets/textures/earth_color.jpg");
```
And load the bump, cloud, and light maps accordingly.
