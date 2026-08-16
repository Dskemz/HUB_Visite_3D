/* ========================================================================
   MOBILE CONFIG & BABYLON.JS — Version parallèle clean (Mobile First)
   ========================================================================
   Responsabilités :
     1. Configuration globale (agence, propriété, branding)
     2. Babylon.js : engine, scene, camera, chargement GLB
     3. FOV dynamique (portrait / paysage)
     4. DeviceOrientationCamera (gyroscope)
     5. UI interactions (sidebar, footer, bottomsheet, modal, carousel)
     6. Vibration haptique
     7. Compteur pièces visitées
   ======================================================================== */

'use strict';

/* ========================================================================
   1. CONFIGURATION GLOBALE
   ======================================================================== */

window.agencyConfig = window.agencyConfig || {
    logoUrl: null,
    name: 'Agence',
    phone: null,
    whatsapp: null,
    navyColor: '#1a2b4d',
    accentColor: '#ff6b35',
};

/* Lecture des paramètres URL */
const params = new URLSearchParams(location.search);
const PROPERTY_ID = params.get('property') || 'demo-rambouillet';
const AGENCY_ID   = params.get('agency')   || null;
const BASE_PATH   = `properties/${PROPERTY_ID}/`;

/* ========================================================================
   2. BABYLON.JS — ENGINE, SCENE, CAMERA
   ======================================================================== */

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true,
    adaptToDeviceRatio: true,
});

let scene, camera, currentRoom = null;
const roomMeshes   = {};   // { 'salon': [mesh1, mesh2, …] }
const visitedRooms = new Set();
let manifest = null;

/* ---------- FOV DYNAMIQUE ---------- */

const FOV_DESKTOP  = 0.8;       // ~46° (valeur Babylon par défaut)
const FOV_PORTRAIT = 1.1;       // ~63° — plus large pour ne pas couper les murs
const FOV_LANDSCAPE = 0.9;      // ~52°

function getAdaptiveFOV() {
    const ratio = window.innerWidth / window.innerHeight;
    if (ratio < 1)   return FOV_PORTRAIT;   // Portrait
    if (ratio < 1.5) return FOV_LANDSCAPE;  // Paysage serré
    return FOV_DESKTOP;                     // Desktop / tablette
}

function applyFOV() {
    if (!camera) return;
    const targetFOV = getAdaptiveFOV();
    // Smooth transition vers le nouveau FOV
    const current = camera.fov;
    const step = (targetFOV - current) * 0.15;
    if (Math.abs(step) > 0.001) {
        camera.fov += step;
        requestAnimationFrame(applyFOV);
    } else {
        camera.fov = targetFOV;
    }
}

/* ---------- CREATION DE LA SCENE ---------- */

async function createScene() {
    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.06, 0.08, 0.1, 1);

    // Ambient light douce
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.8;
    hemi.groundColor = new BABYLON.Color3(0.3, 0.3, 0.35);

    // Directional subtile
    const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-0.5, -1, 0.5), scene);
    dir.intensity = 0.4;

    // ArcRotateCamera (tactile friendly)
    camera = new BABYLON.ArcRotateCamera(
        'cam',
        -Math.PI / 2,  // alpha
        Math.PI / 3,    // beta
        8,              // radius
        BABYLON.Vector3.Zero(),
        scene
    );
    camera.fov = getAdaptiveFOV();
    camera.lowerRadiusLimit = 1;
    camera.upperRadiusLimit = 20;
    camera.lowerBetaLimit   = 0.2;
    camera.upperBetaLimit   = Math.PI / 2.1;
    camera.wheelPrecision   = 50;
    camera.pinchPrecision   = 60;
    camera.panningSensibility = 200;
    camera.attachControl(canvas, true);

    // Touch-specific : inertie fluide
    camera.inertia = 0.85;
    camera.panningInertia = 0.85;

    // Charger le manifest puis les GLB
    await loadManifest();
    await loadGLBs();

    // Centrer la caméra sur la scène
    fitCameraToScene();

    return scene;
}

/* ---------- MANIFEST ---------- */

async function loadManifest() {
    try {
        const resp = await fetch(`${BASE_PATH}manifest.json`);
        manifest = await resp.json();
        updateHeader();
    } catch (e) {
        console.warn('[Mobile] Pas de manifest.json, chargement GLB brut.');
        manifest = null;
    }
}

/* ---------- CHARGEMENT GLB ---------- */

async function loadGLBs() {
    // Déterminer la liste des GLB à charger
    let glbFiles = ['walls.glb'];

    if (manifest && manifest.pieces) {
        // Le manifest liste les pièces
        manifest.pieces.forEach(p => {
            if (p.fichier && !glbFiles.includes(p.fichier)) {
                glbFiles.push(p.fichier);
            }
        });
    } else {
        // Fallback : tenter les fichiers courants
        const common = [
            'plafond.glb', 'salon.glb', 'cuisine.glb',
            'chambre.glb', 'grandechambre.glb', 'petitechambre.glb',
            'salledebain.glb', 'toilette.glb', 'entree.glb', 'balcon.glb'
        ];
        glbFiles = glbFiles.concat(common);
    }

    const loadPromises = glbFiles.map(async (file) => {
        try {
            const result = await BABYLON.SceneLoader.ImportMeshAsync(
                '', BASE_PATH, file, scene
            );
            const roomName = file.replace('.glb', '');
            roomMeshes[roomName] = result.meshes;

            // Tagging des meshes pour identification
            result.meshes.forEach(m => {
                m.metadata = m.metadata || {};
                m.metadata.room = roomName;
            });
            return roomName;
        } catch (e) {
            // Silencieux : le fichier n'existe pas (normal pour le fallback)
            return null;
        }
    });

    const loaded = (await Promise.all(loadPromises)).filter(Boolean);
    console.log(`[Mobile] ${loaded.length} GLB chargé(s) :`, loaded);

    // MAJ compteur
    updateRoomCounter(loaded.length);
}

/* ---------- CENTRAGE CAMERA ---------- */

function fitCameraToScene() {
    if (!scene || !camera) return;

    // Calculer la bounding box globale
    let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
    let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

    scene.meshes.forEach(m => {
        if (!m.isEnabled() || !m.getBoundingInfo) return;
        const bi = m.getBoundingInfo();
        min = BABYLON.Vector3.Minimize(min, bi.boundingBox.minimumWorld);
        max = BABYLON.Vector3.Maximize(max, bi.boundingBox.maximumWorld);
    });

    const center = BABYLON.Vector3.Center(min, max);
    const extent = max.subtract(min);
    const maxDim = Math.max(extent.x, extent.y, extent.z);

    camera.setTarget(center);
    camera.radius = maxDim * 1.2;
    camera.alpha  = -Math.PI / 2;
    camera.beta   = Math.PI / 3;
}

/* ========================================================================
   3. GYROSCOPE (DeviceOrientationCamera)
   ======================================================================== */

let gyroscopeActive = false;
let savedCameraState = null;

function toggleGyroscope() {
    const btn = document.getElementById('toggleGyroscope');

    if (!gyroscopeActive) {
        // Sauvegarder l'état actuel
        savedCameraState = {
            alpha: camera.alpha,
            beta: camera.beta,
            radius: camera.radius,
            target: camera.target.clone(),
            fov: camera.fov
        };

        // Activer le gyroscope : on switche vers une DeviceOrientationCamera
        // positionnée à l'emplacement courant de la caméra
        const pos = camera.position.clone();
        const target = camera.target.clone();

        camera.detachControl(canvas);

        const deviceCam = new BABYLON.DeviceOrientationCamera(
            'deviceCam', pos, scene
        );
        deviceCam.setTarget(target);
        deviceCam.fov = camera.fov;
        scene.activeCamera = deviceCam;
        deviceCam.attachControl(canvas, true);

        gyroscopeActive = true;
        btn.classList.add('active');
        hapticFeedback();

    } else {
        // Restaurer l'ArcRotateCamera
        const deviceCam = scene.activeCamera;
        deviceCam.detachControl(canvas);
        deviceCam.dispose();

        camera.alpha  = savedCameraState.alpha;
        camera.beta   = savedCameraState.beta;
        camera.radius = savedCameraState.radius;
        camera.setTarget(savedCameraState.target);
        camera.fov    = savedCameraState.fov;

        scene.activeCamera = camera;
        camera.attachControl(canvas, true);

        gyroscopeActive = false;
        btn.classList.remove('active');
        hapticFeedback();
    }
}

/* ========================================================================
   4. VIBRATION HAPTIQUE
   ======================================================================== */

function hapticFeedback(duration = 10) {
    if ('vibrate' in navigator) {
        navigator.vibrate(duration);
    }
}

/* ========================================================================
   5. UI — HEADER, COMPTEUR, BRANDING
   ======================================================================== */

function updateHeader() {
    const titleEl = document.getElementById('currentRoomName');
    if (manifest && manifest.nom) {
        titleEl.textContent = manifest.nom;
    } else {
        titleEl.textContent = PROPERTY_ID.replace(/-/g, ' ');
    }

    // Logo agence
    if (window.agencyConfig.logoUrl) {
        document.getElementById('agencyLogo').src = window.agencyConfig.logoUrl;
    }
}

function updateRoomCounter(total) {
    const el = document.getElementById('roomCounter');
    el.textContent = `${visitedRooms.size}/${total}`;
}

function markRoomVisited(roomName) {
    if (!visitedRooms.has(roomName)) {
        visitedRooms.add(roomName);
        const total = Object.keys(roomMeshes).length;
        updateRoomCounter(total);
        hapticFeedback(5);
    }
}

/* ========================================================================
   6. BRANDING DYNAMIQUE (Couleurs agence)
   ======================================================================== */

async function loadBranding() {
    // 1) Branding par propriété
    try {
        const resp = await fetch(`${BASE_PATH}branding.json`);
        if (resp.ok) {
            const brand = await resp.json();
            if (brand.navyColor)   document.documentElement.style.setProperty('--color-navy', brand.navyColor);
            if (brand.accentColor) document.documentElement.style.setProperty('--color-accent', brand.accentColor);
            Object.assign(window.agencyConfig, brand);
        }
    } catch (_) { /* pas de branding par bien */ }

    // 2) Branding agence globale (fallback)
    if (AGENCY_ID) {
        try {
            const resp = await fetch(`${BASE_PATH}../branding-${AGENCY_ID}.json`);
            if (resp.ok) {
                const brand = await resp.json();
                if (brand.navyColor)   document.documentElement.style.setProperty('--color-navy', brand.navyColor);
                if (brand.accentColor) document.documentElement.style.setProperty('--color-accent', brand.accentColor);
                if (brand.logoUrl) {
                    window.agencyConfig.logoUrl = brand.logoUrl;
                    document.getElementById('agencyLogo').src = brand.logoUrl;
                }
            }
        } catch (_) { /* pas de branding agence */ }
    }
}

/* ========================================================================
   7. UI — BOTTOM SHEET (Pièce active)
   ======================================================================== */

function openBottomSheet(roomName) {
    const overlay = document.getElementById('bottomSheetOverlay');
    const sheet   = document.getElementById('bottomSheet');
    const title   = document.getElementById('roomTitleSheet');
    const desc    = document.getElementById('roomDescSheet');

    // Chercher les infos de la pièce dans le manifest
    let roomInfo = null;
    if (manifest && manifest.pieces) {
        roomInfo = manifest.pieces.find(p =>
            p.fichier && p.fichier.replace('.glb', '') === roomName
        );
    }

    title.textContent = roomInfo ? roomInfo.nom : roomName.charAt(0).toUpperCase() + roomName.slice(1);
    desc.textContent  = roomInfo && roomInfo.surface
        ? `Surface : ${roomInfo.surface} m²`
        : 'Informations disponibles dans l\'éditeur.';

    // Reset le switch meublé
    document.getElementById('furnishedToggleSheet').checked = true;

    overlay.classList.add('active');
    sheet.classList.add('active');
    hapticFeedback();

    // Marquer comme visitée
    markRoomVisited(roomName);
}

function closeBottomSheet() {
    document.getElementById('bottomSheetOverlay').classList.remove('active');
    document.getElementById('bottomSheet').classList.remove('active');
}

/* ========================================================================
   8. UI — MODAL RDV
   ======================================================================== */

function openRdvModal() {
    document.getElementById('rdvModalOverlay').classList.add('active');
    document.getElementById('rdvModal').classList.add('active');
    hapticFeedback();
}

function closeRdvModal() {
    document.getElementById('rdvModalOverlay').classList.remove('active');
    document.getElementById('rdvModal').classList.remove('active');
}

// Fonction globale pour overrides externes
window.onOpenRdvModal = openRdvModal;

/* ========================================================================
   9. UI — SIDEBAR TOGGLES
   ======================================================================== */

let furnishedGlobal = true;
let dimensionsVisible = false;

function toggleFurnishedGlobal() {
    furnishedGlobal = !furnishedGlobal;
    const btn = document.getElementById('toggleFurnished');
    btn.classList.toggle('active', !furnishedGlobal);
    hapticFeedback();

    // Masquer/montrer tous les meshes non-walls
    Object.entries(roomMeshes).forEach(([name, meshes]) => {
        if (name === 'walls' || name === 'plafond') return;
        meshes.forEach(m => { m.isVisible = furnishedGlobal; });
    });
}

function toggleDimensions() {
    dimensionsVisible = !dimensionsVisible;
    const btn = document.getElementById('toggleDimensions');
    btn.classList.toggle('active', dimensionsVisible);
    hapticFeedback();
    // TODO: Afficher/masquer les cotations 3D (à connecter au système existant)
    console.log('[Mobile] Cotations :', dimensionsVisible ? 'ON' : 'OFF');
}

/* ========================================================================
   10. OUTIL DE MESURE ASSISTÉ
   ======================================================================== */

let measureMode = false;
const measurePoints = [];

function toggleMeasure() {
    measureMode = !measureMode;
    const overlay = document.getElementById('measureOverlay');
    const btn = document.getElementById('toggleMeasure');

    overlay.style.display = measureMode ? 'flex' : 'none';
    btn.classList.toggle('active', measureMode);
    hapticFeedback();

    if (!measureMode) {
        measurePoints.length = 0;
    }
}

function validateMeasurePoint() {
    if (!scene) return;

    // Raycasting depuis le centre de l'écran
    const centerX = engine.getRenderWidth()  / 2;
    const centerY = engine.getRenderHeight() / 2;
    const activeCam = scene.activeCamera;
    const ray = scene.createPickingRay(centerX, centerY, BABYLON.Matrix.Identity(), activeCam);
    const hit = scene.pickWithRay(ray);

    if (hit && hit.hit) {
        measurePoints.push(hit.pickedPoint.clone());
        hapticFeedback(15);

        if (measurePoints.length === 2) {
            const distance = BABYLON.Vector3.Distance(measurePoints[0], measurePoints[1]);
            alert(`Distance : ${distance.toFixed(2)} m`);
            // TODO: Afficher en overlay 3D plutôt qu'alert
            measurePoints.length = 0;
            toggleMeasure();
        }
    }
}

/* ========================================================================
   11. CARROUSEL PHOTOS (Swipe horizontal)
   ======================================================================== */

function initCarousel() {
    const track = document.getElementById('carouselTrack');
    let startX = 0, currentTranslate = 0, prevTranslate = 0, currentIndex = 0;
    let isDragging = false;
    const slides = track.querySelectorAll('.carousel-slide');
    const slideCount = slides.length;

    track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
        track.style.transition = 'none';
    }, { passive: true });

    track.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const diff = e.touches[0].clientX - startX;
        currentTranslate = prevTranslate + diff;
        track.style.transform = `translateX(${currentTranslate}px)`;
    }, { passive: true });

    track.addEventListener('touchend', () => {
        isDragging = false;
        track.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        const moved = currentTranslate - prevTranslate;
        const threshold = track.clientWidth * 0.25;

        if (moved < -threshold && currentIndex < slideCount - 1) {
            currentIndex++;
        } else if (moved > threshold && currentIndex > 0) {
            currentIndex--;
        }

        prevTranslate = -currentIndex * track.clientWidth;
        currentTranslate = prevTranslate;
        track.style.transform = `translateX(${prevTranslate}px)`;
        hapticFeedback(5);
    });
}

/* ========================================================================
   12. EVENT LISTENERS
   ======================================================================== */

function bindEvents() {
    // Sidebar
    document.getElementById('toggleFurnished').addEventListener('click', toggleFurnishedGlobal);
    document.getElementById('toggleDimensions').addEventListener('click', toggleDimensions);
    document.getElementById('toggleMeasure').addEventListener('click', toggleMeasure);
    document.getElementById('toggleGyroscope').addEventListener('click', toggleGyroscope);

    // Footer
    document.getElementById('viewPhotos').addEventListener('click', () => {
        const firstRoom = Object.keys(roomMeshes).find(r => r !== 'walls' && r !== 'plafond') || 'salon';
        openBottomSheet(firstRoom);
    });
    document.getElementById('openRdvModal').addEventListener('click', openRdvModal);

    // Bottom Sheet
    document.getElementById('bottomSheetOverlay').addEventListener('click', closeBottomSheet);

    // RDV Modal
    document.getElementById('closeRdvModal').addEventListener('click', closeRdvModal);
    document.getElementById('rdvModalOverlay').addEventListener('click', closeRdvModal);
    document.getElementById('rdvForm').addEventListener('submit', (e) => {
        e.preventDefault();
        hapticFeedback(20);
        alert('Demande envoyée ! (stub)');
        closeRdvModal();
    });

    // Measure
    document.getElementById('validateMeasure').addEventListener('click', validateMeasurePoint);
    document.getElementById('cancelMeasure').addEventListener('click', toggleMeasure);

    // Switch meublé par pièce (BottomSheet)
    document.getElementById('furnishedToggleSheet').addEventListener('change', (e) => {
        const title = document.getElementById('roomTitleSheet').textContent.toLowerCase();
        const roomKey = Object.keys(roomMeshes).find(k =>
            k.toLowerCase() === title || title.includes(k)
        );
        if (roomKey && roomMeshes[roomKey]) {
            roomMeshes[roomKey].forEach(m => { m.isVisible = e.target.checked; });
        }
        hapticFeedback(5);
    });

    // Resize & orientation
    window.addEventListener('resize', () => {
        engine.resize();
        applyFOV();
    });

    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            engine.resize();
            applyFOV();
        }, 200);
    });

    // Carrousel
    initCarousel();

    // Picking : clic sur une pièce → ouvre la BottomSheet
    scene.onPointerDown = (evt, pickResult) => {
        if (measureMode) return; // Ne pas interférer avec l'outil mesure
        if (pickResult.hit && pickResult.pickedMesh) {
            const meta = pickResult.pickedMesh.metadata;
            if (meta && meta.room && meta.room !== 'walls' && meta.room !== 'plafond') {
                openBottomSheet(meta.room);
            }
        }
    };
}

/* ========================================================================
   13. BOOTSTRAP
   ======================================================================== */

(async function init() {
    await loadBranding();
    await createScene();
    bindEvents();

    engine.runRenderLoop(() => {
        if (scene) scene.render();
    });

    console.log('[Mobile] Viewer initialisé pour :', PROPERTY_ID);
})();