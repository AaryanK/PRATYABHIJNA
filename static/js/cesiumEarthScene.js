// Pratyabhijna CesiumJS Globe Scene

let viewer;
let autoRotationActive = true;
let removeRotationListener;
let markerPosition;
let labelVisible = false;
let pulseListener;
let ringRadius = 1000.0;
const maxRadius = 45000.0; // 45km max pulse bounds

// Geocoding lookup dictionary
const CITY_COORDS = {
    "kathmandu": { lat: 27.7172, lon: 85.3240 },
    "kathmandu, nepal": { lat: 27.7172, lon: 85.3240 },
    "wichita": { lat: 37.6872, lon: -97.3301 },
    "wichita, kansas": { lat: 37.6872, lon: -97.3301 },
    "wichita, ks": { lat: 37.6872, lon: -97.3301 },
    "ujjain": { lat: 23.1765, lon: 75.7885 },
    "ujjain, india": { lat: 23.1765, lon: 75.7885 }
};

function getCityCoordinates(place) {
    const q = place.trim().toLowerCase();
    if (CITY_COORDS[q]) return CITY_COORDS[q];
    
    // Check substring match
    for (const key in CITY_COORDS) {
        if (q.includes(key)) return CITY_COORDS[key];
    }
    
    // Fallback to Kathmandu (Vedic coordinates base)
    return CITY_COORDS["kathmandu"];
}

function initCesiumEarthScene() {
    // 1. Set Access Token if defined, otherwise clear the default built-in token
    if (window.CESIUM_ION_TOKEN && window.CESIUM_ION_TOKEN.trim() !== "" && window.CESIUM_ION_TOKEN !== "None") {
        Cesium.Ion.defaultAccessToken = window.CESIUM_ION_TOKEN;
    } else {
        Cesium.Ion.defaultAccessToken = "";
    }

    // Reset container element opacity styling just in case of re-reveal
    const cosmos = document.getElementById('cosmos');
    if (cosmos) {
        cosmos.style.opacity = '1';
        cosmos.style.transition = 'none';
    }

    let imageryProviderOption;
    if (!Cesium.Ion.defaultAccessToken) {
        // Use CartoDB Dark Matter directly in constructor to prevent loading default Ion imagery
        imageryProviderOption = new Cesium.UrlTemplateImageryProvider({
            url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            subdomains: ['a', 'b', 'c', 'd'],
            credit: 'CartoDB'
        });
    }

    // 2. Initialize viewer
    viewer = new Cesium.Viewer('cosmos', {
        animation: false,
        timeline: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        infoBox: false,
        selectionIndicator: false,
        skyBox: false,
        imageryProvider: imageryProviderOption,
        contextOptions: {
            webgl: {
                alpha: true
            }
        }
    });

    // Style background dark & atmospheric fog
    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
    }
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 2.0e-4;

    // Remove credits logo for full clean cinematic overlay
    if (viewer.cesiumWidget.creditContainer) {
        viewer.cesiumWidget.creditContainer.style.display = 'none';
    }

    // 4. Disable camera controls
    disableCesiumInteraction();

    // Set initial camera perspective (Earth zoomed out looking majestic)
    viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(85.3240, 15.0, 15000000), // 15,000km height
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-90.0),
            roll: 0.0
        }
    });

    // 5. Start rotation
    startAutoRotation();

    // 6. Bind projection overlay renderer
    viewer.scene.postRender.addEventListener(updateMarkerOverlay);
}

function startAutoRotation() {
    autoRotationActive = true;
    let lastTime = Date.now();
    
    removeRotationListener = viewer.scene.postRender.addEventListener(() => {
        if (!autoRotationActive) return;
        
        const now = Date.now();
        const delta = (now - lastTime) / 1000.0;
        lastTime = now;
        
        // Rotate longitude coordinate heading slowly
        viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.012 * delta);
    });
}

function disableCesiumInteraction() {
    const scene = viewer.scene;
    scene.screenSpaceCameraController.enableRotate = false;
    scene.screenSpaceCameraController.enableTranslate = false;
    scene.screenSpaceCameraController.enableZoom = false;
    scene.screenSpaceCameraController.enableTilt = false;
    scene.screenSpaceCameraController.enableLook = false;
}

function enableCesiumInteraction() {
    const scene = viewer.scene;
    scene.screenSpaceCameraController.enableRotate = true;
    scene.screenSpaceCameraController.enableTranslate = true;
    scene.screenSpaceCameraController.enableZoom = true;
    scene.screenSpaceCameraController.enableTilt = true;
    scene.screenSpaceCameraController.enableLook = true;
}

function beginEarthRevealJourney(place, onZoomIn, onZoomOut) {
    autoRotationActive = false;
    
    // Lookup coordinates
    const coords = getCityCoordinates(place);
    markerPosition = Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, 0);

    // Update HTML overlay text
    const nameEl = document.getElementById('markerName');
    const coordsEl = document.getElementById('markerCoords');
    if (nameEl) nameEl.textContent = place;
    if (coordsEl) {
        const latStr = coords.lat >= 0 ? `${coords.lat.toFixed(4)}° N` : `${Math.abs(coords.lat).toFixed(4)}° S`;
        const lonStr = coords.lon >= 0 ? `${coords.lon.toFixed(4)}° E` : `${Math.abs(coords.lon).toFixed(4)}° W`;
        coordsEl.textContent = `${latStr}, ${lonStr}`;
    }

    // Google Earth style zoom-in destination (pushed in close)
    const destination = Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, 650000); // 650km height

    viewer.camera.flyTo({
        destination: destination,
        orientation: {
            heading: Cesium.Math.toRadians(0.0),
            pitch: Cesium.Math.toRadians(-72.0), // cinematic angle look
            roll: 0.0
        },
        duration: 3.4, // smooth fly transition
        complete: () => {
            // Spawn sacred Cesium entity marker
            spawnCesiumMarker(coords.lat, coords.lon, place);
            labelVisible = true;

            if (onZoomIn) onZoomIn(coords);

            // Wait 2.2s before pulling away
            setTimeout(() => {
                leaveEarthToSky(coords, onZoomOut);
            }, 2200);
        }
    });
}

// Compatibility alias
const beginRevealJourney = beginEarthRevealJourney;

function spawnCesiumMarker(lat, lon, place) {
    // Clear any previous entities
    viewer.entities.removeAll();
    if (pulseListener) {
        viewer.scene.postRender.removeEventListener(pulseListener);
        pulseListener = null;
    }

    // 1. Golden point core
    viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        point: {
            pixelSize: 8,
            color: Cesium.Color.fromCssColorString('#f4c978'),
            outlineColor: Cesium.Color.fromCssColorString('#ffe8b0'),
            outlineWidth: 2
        }
    });

    // 2. Vertical cyan glow beam
    viewer.entities.add({
        polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                lon, lat, 0,
                lon, lat, 140000 // 140km altitude
            ]),
            width: 4,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.28,
                taperPower: 0.6,
                color: Cesium.Color.fromCssColorString('#7ffff2')
            })
        }
    });

    // 3. Pulsing surface coordinate ring
    ringRadius = 1000.0;
    viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        ellipse: {
            semiMajorAxis: new Cesium.CallbackProperty(() => ringRadius, false),
            semiMinorAxis: new Cesium.CallbackProperty(() => ringRadius, false),
            material: new Cesium.ColorMaterialProperty(
                new Cesium.CallbackProperty(() => {
                    const alpha = 1.0 - (ringRadius / maxRadius);
                    return Cesium.Color.fromCssColorString('#7ffff2').withAlpha(alpha * 0.75);
                }, false)
            ),
            height: 0.0
        }
    });

    // Animate ellipse radius
    pulseListener = () => {
        ringRadius += 1400.0;
        if (ringRadius > maxRadius) {
            ringRadius = 1000.0;
        }
    };
    viewer.scene.postRender.addEventListener(pulseListener);
}

function leaveEarthToSky(coords, callback) {
    // Keep marker label visible for a bit so we see it center as the flyTo aligns it
    setTimeout(() => {
        labelVisible = false;
    }, 1400);
    
    // Zoom out camera to space (Z=18,000km) centered exactly on birthplace observer coordinates
    const destination = Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, 18000000);

    // Fade the entire Cesium canvas container opacity slowly via CSS
    fadeGlobeIntoMandala(2600);

    viewer.camera.flyTo({
        destination: destination,
        orientation: {
            heading: 0.0,
            pitch: Cesium.Math.toRadians(-90.0), // face straight down
            roll: 0.0
        },
        duration: 2.8,
        complete: () => {
            if (callback) callback();
            // Clear entities and pause rendering to free resources
            viewer.entities.removeAll();
            if (pulseListener) {
                viewer.scene.postRender.removeEventListener(pulseListener);
                pulseListener = null;
            }
        }
    });
}

function fadeGlobeIntoMandala(durationMs) {
    const cosmos = document.getElementById('cosmos');
    if (cosmos) {
        cosmos.style.transition = `opacity ${durationMs}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        cosmos.style.opacity = '0';
    }
}

function updateMarkerOverlay() {
    const label = document.getElementById('markerLabel');
    if (!label) return;

    if (!markerPosition || !labelVisible) {
        label.classList.remove('visible');
        return;
    }
    
    // Project 3D cartesian coordinates onto 2D screen space pixels
    const canvasCoords = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, markerPosition);
    if (canvasCoords) {
        label.style.left = `${canvasCoords.x}px`;
        label.style.top = `${canvasCoords.y}px`;
        label.classList.add('visible');
    } else {
        label.classList.remove('visible');
    }
}

function destroyOrPauseCesiumIfNeeded() {
    if (viewer) {
        viewer.scene.postRender.removeEventListener(updateMarkerOverlay);
        if (removeRotationListener) removeRotationListener();
        if (pulseListener) viewer.scene.postRender.removeEventListener(pulseListener);
        viewer.destroy();
        viewer = null;
    }
}
