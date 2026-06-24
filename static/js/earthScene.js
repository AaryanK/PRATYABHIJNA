// Pratyabhijna Immersive WebGL Earth Scene

let scene, camera, renderer, earthMesh, cloudMesh, decoTorus1, decoTorus2;
let starsPoints, markerRing, markerGroup;
let autoRotate = true;
let animState = {
    progress: 0,
    active: false,
    duration: 3000, // ms
    startX: 0, startY: 0, startZ: 12,
    targetX: 0, targetY: 0, targetZ: 5.5,
    rotStartX: 0, rotStartY: 0,
    rotTargetX: 0, rotTargetY: 0,
    callback: null
};

let markerState = {
    active: false,
    scale: 0.1,
    opacity: 1
};

// Geocoding lookup dictionary
const CITY_COORDS = {
    "kathmandu": { lat: 27.7172, lon: 85.3240 },
    "kathmandu, nepal": { lat: 27.7172, lon: 85.3240 },
    "wichita": { lat: 37.6872, lon: -97.3301 },
    "wichita, kansas": { lat: 37.6872, lon: -97.3301 },
    "wichita, ks": { lat: 37.6872, lon: -97.3301 },
    "ujjain": { lat: 23.1765, lon: 75.7885 },
    "ujjain, india": { lat: 23.1765, lon: 75.7885 },
    "delhi": { lat: 28.6139, lon: 77.2090 },
    "delhi, india": { lat: 28.6139, lon: 77.2090 },
    "new delhi": { lat: 28.6139, lon: 77.2090 },
    "mumbai": { lat: 19.0760, lon: 72.8777 },
    "mumbai, india": { lat: 19.0760, lon: 72.8777 },
    "london": { lat: 51.5074, lon: -0.1278 },
    "london, uk": { lat: 51.5074, lon: -0.1278 },
    "new york": { lat: 40.7128, lon: -74.0060 },
    "new york city": { lat: 40.7128, lon: -74.0060 },
    "new york, ny": { lat: 40.7128, lon: -74.0060 },
    "tokyo": { lat: 35.6762, lon: 139.6503 },
    "tokyo, japan": { lat: 35.6762, lon: 139.6503 }
};

function getCityCoordinates(place) {
    const q = place.trim().toLowerCase();
    if (CITY_COORDS[q]) return CITY_COORDS[q];
    
    // Check substring match
    for (const key in CITY_COORDS) {
        if (q.includes(key)) return CITY_COORDS[key];
    }
    
    // Default fallback to Ujjain (Vedic prime meridian center)
    return CITY_COORDS["ujjain"];
}

// Convert Lat/Lon to Vector3 coordinates on sphere surface
function latLonToVector3(lat, lon, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    
    return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
        -radius * Math.sin(phi) * Math.cos(theta)
    );
}

// Draw a local vector procedural coordinate earth texture
function createProceduralEarthTexture() {
    const canvasTex = document.createElement('canvas');
    canvasTex.width = 2048;
    canvasTex.height = 1024;
    const ctxTex = canvasTex.getContext('2d');
    
    // Ocean background
    ctxTex.fillStyle = '#060416';
    ctxTex.fillRect(0, 0, 2048, 1024);
    
    // Ocean coordinate gridlines
    ctxTex.strokeStyle = 'rgba(139, 92, 255, 0.08)';
    ctxTex.lineWidth = 1;
    for (let i = 0; i < 2048; i += 64) {
        ctxTex.beginPath(); ctxTex.moveTo(i, 0); ctxTex.lineTo(i, 1024); ctxTex.stroke();
    }
    for (let i = 0; i < 1024; i += 64) {
        ctxTex.beginPath(); ctxTex.moveTo(0, i); ctxTex.lineTo(2048, i); ctxTex.stroke();
    }
    
    // Stylized golden continent fills & outlines
    ctxTex.fillStyle = 'rgba(244, 201, 120, 0.16)';
    ctxTex.strokeStyle = 'rgba(244, 201, 120, 0.42)';
    ctxTex.lineWidth = 3;
    
    // Vector continents
    const continents = [
        // North America
        [[-165, 72], [-140, 70], [-80, 75], [-55, 60], [-50, 48], [-80, 25], [-100, 16], [-105, 20], [-120, 34], [-125, 48], [-165, 60]],
        // South America
        [[-80, 12], [-70, 10], [-38, -6], [-42, -20], [-70, -54], [-74, -50], [-80, -22], [-80, 12]],
        // Africa
        [[-17, 32], [-5, 36], [10, 36], [32, 31], [50, 12], [46, -10], [40, -32], [22, -34], [10, -5], [-17, 6], [-17, 32]],
        // Eurasia
        [[30, 32], [40, 45], [60, 72], [100, 75], [170, 70], [140, 35], [120, 15], [105, 10], [80, 6], [74, 15], [30, 32]],
        // Australia
        [[113, -22], [143, -15], [152, -34], [114, -35], [113, -22]],
        // Antarctica (abstract boundary line)
        [[-180, -75], [180, -75], [180, -90], [-180, -90]],
        // India detailed contour (for calibration representation)
        [[68, 25], [74, 28], [88, 26], [82, 10], [78, 8], [72, 16], [68, 25]]
    ];
    
    continents.forEach(poly => {
        ctxTex.beginPath();
        poly.forEach((pt, idx) => {
            const x = (pt[0] + 180) * (2048 / 360);
            const y = (90 - pt[1]) * (1024 / 180);
            if (idx === 0) ctxTex.moveTo(x, y);
            else ctxTex.lineTo(x, y);
        });
        ctxTex.closePath();
        ctxTex.fill();
        ctxTex.stroke();
    });
    
    return new THREE.CanvasTexture(canvasTex);
}

function createProceduralCloudTexture() {
    const canvasTex = document.createElement('canvas');
    canvasTex.width = 1024;
    canvasTex.height = 512;
    const ctxTex = canvasTex.getContext('2d');
    ctxTex.clearRect(0, 0, 1024, 512);
    
    for (let i = 0; i < 35; i++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 512;
        const r = 50 + Math.random() * 110;
        const grad = ctxTex.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
        grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.20)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctxTex.fillStyle = grad;
        ctxTex.beginPath();
        ctxTex.arc(x, y, r, 0, Math.PI * 2);
        ctxTex.fill();
    }
    return new THREE.CanvasTexture(canvasTex);
}

function initEarthScene() {
    // 1. Setup Scene & Camera
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 12);

    // 2. WebGL Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("cosmos"), antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    // 3. Starfield Coordinate Particles
    const starsGeo = new THREE.BufferGeometry();
    const starCount = 1800;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const radius = 120 + Math.random() * 40;
        
        positions[i] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i + 2] = radius * Math.cos(phi);
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMat = new THREE.PointsMaterial({
        color: 0xd8c5ff,
        size: 0.28,
        transparent: true,
        opacity: 0.8
    });
    starsPoints = new THREE.Points(starsGeo, starsMat);
    scene.add(starsPoints);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0x0a051d, 1.5);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffeb3b, 1.25);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    // 5. Earth Mesh with procedural texture
    const earthTex = createProceduralEarthTexture();
    const earthGeo = new THREE.SphereGeometry(4, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
        map: earthTex,
        roughness: 0.8,
        metalness: 0.1,
        bumpScale: 0.08,
        transparent: true,
        opacity: 1
    });
    earthMesh = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earthMesh);

    // 5b. Clouds layer mesh (slightly larger than earth)
    const cloudTex = createProceduralCloudTexture();
    const cloudGeo = new THREE.SphereGeometry(4.025, 64, 64);
    const cloudMat = new THREE.MeshStandardMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.42,
        blending: THREE.NormalBlending
    });
    cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    earthMesh.add(cloudMesh);

    // 6. Coordinate Wireframe shell
    const wireGeo = new THREE.SphereGeometry(4.015, 32, 32);
    const wireMat = new THREE.MeshBasicMaterial({
        color: 0x7ffff2,
        wireframe: true,
        transparent: true,
        opacity: 0.04
    });
    const wireShell = new THREE.Mesh(wireGeo, wireMat);
    earthMesh.add(wireShell);

    // 6b. Atmospheric Glow Shell (BackSide rendering with additive blending)
    const atmosGeo = new THREE.SphereGeometry(4.16, 32, 32);
    const atmosMat = new THREE.MeshBasicMaterial({
        color: 0x8b5cff,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide
    });
    const atmosShell = new THREE.Mesh(atmosGeo, atmosMat);
    earthMesh.add(atmosShell);

    // Asynchronously load premium assets if they exist (under static/assets/textures/)
    const texLoader = new THREE.TextureLoader();
    
    // 1. Load Earth Day Map
    texLoader.load('/static/assets/textures/earth_day.jpg', (tex) => {
        earthMat.map = tex;
        earthMat.roughness = 0.55; // make oceans glossier
        earthMat.needsUpdate = true;
    }, undefined, () => console.log("Using procedural fallback for Earth Day map."));
    
    // 2. Load Earth Bump Map
    texLoader.load('/static/assets/textures/earth_bump.jpg', (tex) => {
        earthMat.bumpMap = tex;
        earthMat.bumpScale = 0.18;
        earthMat.needsUpdate = true;
    }, undefined, () => console.log("Using procedural fallback for Earth Bump map."));

    // 3. Load Earth Night lights Map (uses emissive for glow on the dark side)
    texLoader.load('/static/assets/textures/earth_night.jpg', (tex) => {
        earthMat.emissiveMap = tex;
        earthMat.emissive = new THREE.Color(0xffe8b0); // Warm golden cities lights
        earthMat.emissiveIntensity = 1.25;
        earthMat.needsUpdate = true;
    }, undefined, () => console.log("Using procedural fallback for Earth Night lights."));

    // 4. Load Clouds PNG
    texLoader.load('/static/assets/textures/earth_clouds.png', (tex) => {
        cloudMat.map = tex;
        cloudMat.needsUpdate = true;
    }, undefined, () => console.log("Using procedural fallback for Clouds texture."));

    // 7. Rotating Ecliptic Torus (Sacred Astronomy)
    const torusGeo1 = new THREE.TorusGeometry(5.2, 0.015, 8, 100);
    const torusMat1 = new THREE.MeshBasicMaterial({ color: 0xf4c978, transparent: true, opacity: 0.15 });
    decoTorus1 = new THREE.Mesh(torusGeo1, torusMat1);
    decoTorus1.rotation.x = Math.PI / 2.3;
    scene.add(decoTorus1);

    const torusGeo2 = new THREE.TorusGeometry(4.6, 0.008, 8, 100);
    const torusMat2 = new THREE.MeshBasicMaterial({ color: 0x8b5cff, transparent: true, opacity: 0.12 });
    decoTorus2 = new THREE.Mesh(torusGeo2, torusMat2);
    decoTorus2.rotation.x = Math.PI / -2.1;
    decoTorus2.rotation.y = Math.PI / 6;
    scene.add(decoTorus2);

    // 8. Render loops
    function renderLoop() {
        requestAnimationFrame(renderLoop);
        
        // Slow Y rotation if autoRotate
        if (autoRotate) {
            earthMesh.rotation.y += 0.0006;
            starsPoints.rotation.y += 0.00008;
        }
        if (cloudMesh) {
            cloudMesh.rotation.y += 0.0009;
        }

        // Rotate decorative toruses slowly
        decoTorus1.rotation.z += 0.0004;
        decoTorus2.rotation.z -= 0.0003;

        // Easing interpolation for Reveal Journey
        if (animState.active) {
            const now = performance.now();
            const elapsed = now - animState.startTime;
            let t = Math.min(1, elapsed / animState.duration);
            
            // Cubic Bezier Easing: ease-in-out
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            
            // Interpolate camera position
            camera.position.z = animState.startZ + (animState.targetZ - animState.startZ) * ease;
            
            // Interpolate earthMesh Y/X rotations
            earthMesh.rotation.y = animState.rotStartY + (animState.rotTargetY - animState.rotStartY) * ease;
            earthMesh.rotation.x = animState.rotStartX + (animState.rotTargetX - animState.rotStartX) * ease;

            if (t >= 1) {
                animState.active = false;
                if (animState.callback) animState.callback();
            }
        }

        // Animate Birthplace Marker Pulse
        if (markerState.active && markerRing) {
            markerState.scale += 0.035;
            markerRing.scale.set(markerState.scale, markerState.scale, 1);
            markerRing.material.opacity = 1.0 - (markerState.scale / 3.0);
            
            if (markerState.scale > 3.0) {
                markerState.scale = 0.1;
            }
        }

        // Project 3D marker coordinates to 2D HTML overlay
        updateMarkerOverlay();

        renderer.render(scene, camera);
    }
    
    function updateMarkerOverlay() {
        const label = document.getElementById('markerLabel');
        if (!label) return;

        if (!markerGroup || !markerGroup.visible || !markerState.active) {
            label.classList.remove('visible');
            return;
        }
        
        // Get 3D world position of the marker group
        const worldPos = new THREE.Vector3();
        markerGroup.getWorldPosition(worldPos);
        
        // Project to normalized device coordinates (NDC)
        worldPos.project(camera);
        
        // Check if behind camera
        if (worldPos.z > 1) {
            label.classList.remove('visible');
            return;
        }
        
        // Convert to CSS pixels
        const x = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(worldPos.y * 0.5) + 0.5) * window.innerHeight;
        
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
        label.classList.add('visible');
    }

    renderLoop();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Fly to Birthplace Coordinates
function beginRevealJourney(place, onZoomIn, onZoomOut) {
    autoRotate = false;
    
    // Get lat/lon coordinates
    const coords = getCityCoordinates(place);
    
    // Update HTML overlay labels immediately
    const nameEl = document.getElementById('markerName');
    const coordsEl = document.getElementById('markerCoords');
    if (nameEl) nameEl.textContent = place;
    if (coordsEl) {
        const latStr = coords.lat >= 0 ? `${coords.lat.toFixed(4)}° N` : `${Math.abs(coords.lat).toFixed(4)}° S`;
        const lonStr = coords.lon >= 0 ? `${coords.lon.toFixed(4)}° E` : `${Math.abs(coords.lon).toFixed(4)}° W`;
        coordsEl.textContent = `${latStr}, ${lonStr}`;
    }

    // Target rotations to align birthplace center with Z axis (facing camera)
    const targetY = (-coords.lon - 180) * (Math.PI / 180);
    const targetX = coords.lat * (Math.PI / 180);

    // Initial state
    animState.startTime = performance.now();
    animState.active = true;
    animState.duration = 2600;
    
    animState.startZ = camera.position.z;
    animState.targetZ = 6.2; // Zoom in target
    
    // Ensure rotation interpolates smoothly by taking the shortest angular distance
    animState.rotStartY = earthMesh.rotation.y;
    animState.rotStartX = earthMesh.rotation.x;
    
    animState.rotTargetY = targetY;
    animState.rotTargetX = targetX;
    
    animState.callback = () => {
        // Spawn Birthplace Marker Group (Point, Beam, Ring)
        spawnBirthplaceMarker(coords.lat, coords.lon);
        
        if (onZoomIn) onZoomIn(coords);
        
        // Wait 1.6s showing marker and birthplace, then fly out
        setTimeout(() => {
            leaveEarthToSky(onZoomOut);
        }, 1600);
    };
}

function spawnBirthplaceMarker(lat, lon) {
    // Clear previous marker group and dispose geometries/materials to prevent memory leaks
    if (markerGroup) {
        markerGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        earthMesh.remove(markerGroup);
    }

    markerGroup = new THREE.Group();

    // 1. Golden Point (small sphere on surface)
    const pointGeo = new THREE.SphereGeometry(0.04, 16, 16);
    const pointMat = new THREE.MeshBasicMaterial({ color: 0xf4c978 });
    const pointMesh = new THREE.Mesh(pointGeo, pointMat);
    markerGroup.add(pointMesh);

    // 2. Vertical Glow Beam (cylinder extending outwards)
    const beamGeo = new THREE.CylinderGeometry(0.005, 0.03, 0.8, 16, 1, true);
    beamGeo.translate(0, 0.4, 0); // move geometry pivot to bottom so it points outwards
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0x7ffff2,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.rotation.x = Math.PI / 2; // rotate beam so it aligns outwards
    markerGroup.add(beamMesh);

    // 3. Pulsing Coordinate Ring (flat circle mapped to surface)
    const ringGeo = new THREE.RingGeometry(0.01, 0.14, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x7ffff2,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95
    });
    markerRing = new THREE.Mesh(ringGeo, ringMat);
    markerRing.lookAt(new THREE.Vector3(0, 0, 0));
    markerRing.rotation.y += Math.PI;
    markerGroup.add(markerRing);

    // Position the entire group on Sphere surface
    const pos = latLonToVector3(lat, lon, 4.02);
    markerGroup.position.copy(pos);
    
    // Make the entire group look away from center (align with surface normal)
    const targetVec = pos.clone().normalize();
    markerGroup.lookAt(pos.clone().add(targetVec));

    earthMesh.add(markerGroup);
    
    markerState.active = true;
    markerState.scale = 0.1;
}

// Fade out Earth and pull camera into starry mandala space
function leaveEarthToSky(callback) {
    animState.startTime = performance.now();
    animState.active = true;
    animState.duration = 2400;
    
    animState.startZ = camera.position.z;
    animState.targetZ = 20; // Fly out/backward
    
    animState.rotStartY = earthMesh.rotation.y;
    animState.rotStartX = earthMesh.rotation.x;
    animState.rotTargetY = earthMesh.rotation.y - Math.PI / 4; // slow rotation Y during exit
    animState.rotTargetX = earthMesh.rotation.x + Math.PI / 6;

    // Fade out earth mesh & rings during camera flyout
    const fadeStart = performance.now();
    
    // Store initial opacities for all materials on first run
    earthMesh.traverse(child => {
        if (child.material) {
            if (child.userData.initialOpacity === undefined) {
                child.userData.initialOpacity = child.material.opacity !== undefined ? child.material.opacity : 1;
            }
        }
    });
    if (decoTorus1.material && decoTorus1.userData.initialOpacity === undefined) decoTorus1.userData.initialOpacity = 0.15;
    if (decoTorus2.material && decoTorus2.userData.initialOpacity === undefined) decoTorus2.userData.initialOpacity = 0.12;

    function fadeOut() {
        const t = (performance.now() - fadeStart) / 2000;
        if (t < 1) {
            // Fade earth mesh and all children (clouds, wireframe, atmosphere, marker)
            earthMesh.traverse(child => {
                if (child.material) {
                    child.material.transparent = true;
                    child.material.opacity = child.userData.initialOpacity * (1 - t);
                }
            });
            
            // Fading decorative toruses
            decoTorus1.material.opacity = decoTorus1.userData.initialOpacity * (1 - t);
            decoTorus2.material.opacity = decoTorus2.userData.initialOpacity * (1 - t);
            
            requestAnimationFrame(fadeOut);
        } else {
            earthMesh.visible = false;
            decoTorus1.visible = false;
            decoTorus2.visible = false;
        }
    }
    fadeOut();

    animState.callback = () => {
        // Trigger complete callback to construct mandala
        if (callback) callback();
    };
}
