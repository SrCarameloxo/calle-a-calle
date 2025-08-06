window.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURACIÓN Y CLIENTES ---
    const SUPABASE_URL = 'https://hppzwfwtedghpsxfonoh.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjQzNDMsImV4cCI6MjA2OTcwMDM0M30.BAh6i5iJ5YkDBoydfkC9azAD4eMdYBkEBdxws9kj5Hg';
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- REFERENCIAS A ELEMENTOS DEL DOM ---
    const loginScreen = document.getElementById('login-screen');
    const gameScreen = document.getElementById('game-screen');
    const gameMapContainer = document.getElementById('game-map-container');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const reportIncidentBtn = document.getElementById('report-incident-btn');
    const questionArea = document.getElementById('question-area');
    const streetNameText = document.getElementById('street-name-text');
    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');
    const infoText = document.getElementById('info-text');
    const poiSwitchContainer = document.getElementById('poi-switch-container');
    const poiCheckbox = document.getElementById('poi-checkbox');
    const mainActionBtn = document.getElementById('main-action-btn');
    const feedbackPopup = document.getElementById('feedback-popup');
    const feedbackText = document.getElementById('feedback-text');
    const menuBtn = document.querySelector('#menu-btn-group');
    const menuOverlay = document.getElementById('menu-overlay');
    const closeMenuBtn = document.getElementById('close-menu-btn');
    const reportModal = document.getElementById('report-modal');
    const cancelReportBtn = document.getElementById('cancel-report-btn');
    const submitReportBtn = document.getElementById('submit-report-btn');
    const reportTextarea = document.getElementById('report-textarea');
    const userAvatarGroup = document.querySelector('#user-avatar-group');
    const userAvatarImg = document.getElementById('user-avatar');


    // --- VARIABLES DE ESTADO DEL JUEGO ---
    let gameMap = null, backgroundMap = null;
    const COL_ZONE = '#663399', COL_TRACE = '#007a2f', COL_DASH = '#1976d2';
    let drawing = false, zonePoly = null, tempMarkers = [], zonePoints = [], oldZonePoly = null;
    let playing = false, qIdx = 0, target = null, userMk, guide, streetGrp;
    let streetList = [], totalQuestions = 0, streetsGuessedCorrectly = 0, lastGameZonePoints = [];
    let userProfile = { cityData: null, subscribedCity: null, role: null };

    // --- LÓGICA DE LA INTERFAZ ---
    function updateInfoPanel(htmlContent) { infoText.innerHTML = htmlContent; }
    function showFeedbackPopup(message, type) {
        feedbackText.textContent = message;
        feedbackPopup.className = '';
        feedbackPopup.classList.add(type, 'visible');
        setTimeout(() => feedbackPopup.classList.remove('visible'), 2500);
    }
    function updateActionBtn(text, color, clickHandler, disabled = false) {
        mainActionBtn.textContent = text;
        mainActionBtn.className = `action-btn ${color}`;
        mainActionBtn.onclick = clickHandler;
        mainActionBtn.disabled = disabled;
    }
    
    // --- LÓGICA DE AUTENTICACIÓN Y PERFIL ---
    async function signInWithGoogle() { await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); }
    async function signOut() { await supabaseClient.auth.signOut(); }
    async function fetchUserProfile(user) {
        if (!user) return;
        try {
            const { data: profile, error } = await supabaseClient.from('profiles').select('role, subscribed_city, avatar_url').eq('id', user.id).single();
            if (error && error.code === 'PGRST116') return setTimeout(() => fetchUserProfile(user), 1000);
            if (error) throw error;
            userProfile = { ...userProfile, role: profile.role, subscribedCity: profile.subscribed_city };
            userAvatarImg.src = profile.avatar_url || user.user_metadata.avatar_url || 'https://placehold.co/48x48/2b324c/FFF?text=U';
            if (profile.subscribed_city) {
                const { data: city, error: cityError } = await supabaseClient.from('cities').select('*').eq('name', profile.subscribed_city).single();
                if (cityError) throw new Error(`No se encontraron datos para la ciudad: ${profile.subscribed_city}`);
                userProfile.cityData = city;
            }
        } catch (e) { console.error("Error fetching user profile:", e); }
    }
    async function handleAuthStateChange(event, session) {
        const user = session?.user;
        if (user) {
            loginScreen.style.opacity = '0';
            setTimeout(async () => {
                loginScreen.classList.add('hidden');
                gameScreen.classList.remove('hidden');
                await fetchUserProfile(user);
                if (!gameMap) initGame(); else gameMap.invalidateSize();
                setupMenu(user);
            }, 300);
        } else {
            loginScreen.classList.remove('hidden'); 
            loginScreen.style.opacity = '1';
            gameScreen.classList.add('hidden');
            if (!backgroundMap) {
                backgroundMap = L.map('background-map', { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false });
                L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', { attribution: '' }).addTo(backgroundMap);
                backgroundMap.setView([38.88, -6.97], 15);
            }
        }
    }
    
    // --- INICIALIZACIÓN ---
    function initGame() {
        let initialCoords = [38.88, -6.97], initialZoom = 13;
        if (userProfile.cityData) {
            initialCoords = [userProfile.cityData.center_lat, userProfile.cityData.center_lng];
            initialZoom = userProfile.cityData.default_zoom;
        }
        gameMap = L.map(gameMapContainer, { zoomSnap: 0.25, zoomControl: false });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', { attribution: '© OSM & CARTO', minZoom: userProfile.cityData ? initialZoom - 2 : 5 }).addTo(gameMap);
        gameMap.setView(initialCoords, initialZoom);
        if (userProfile.cityData) {
            const latOffset = 20 / 111.1;
            const lngOffset = 20 / (111.1 * Math.cos(initialCoords[0] * Math.PI / 180));
            const bounds = L.latLngBounds(L.latLng(initialCoords[0] - latOffset, initialCoords[1] - lngOffset), L.latLng(initialCoords[0] + latOffset, initialCoords[1] + lngOffset));
            gameMap.setMaxBounds(bounds);
        }
        gameMap.invalidateSize();
        updateActionBtn('Establecer Zona', 'btn-blue', startDrawing);
        reportIncidentBtn.onclick = () => reportModal.classList.remove('hidden');
        cancelReportBtn.onclick = () => reportModal.classList.add('hidden');
        submitReportBtn.onclick = submitIncidentReport;
    }

    function setupMenu(user) {
        menuBtn.onclick = () => menuOverlay.classList.remove('hidden');
        userAvatarGroup.onclick = () => menuOverlay.classList.remove('hidden');

        closeMenuBtn.onclick = () => menuOverlay.classList.add('hidden');
        const profilePanel = document.getElementById('profile-content');
        profilePanel.innerHTML = `<div id="profile-content-container"><p>Conectado como</p><p class="font-bold">${user.email}</p><button id="logout-btn" class="action-btn btn-red">Cerrar Sesión</button></div>`;
        document.getElementById('logout-btn').onclick = signOut;
        document.querySelectorAll('.menu-tab-btn').forEach(button => {
            button.addEventListener('click', () => {
                const panelId = button.dataset.panel;
                document.querySelectorAll('.menu-tab-btn, .menu-panel').forEach(el => el.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(panelId).classList.add('active');
                if (panelId === 'saved-zones-content') displaySavedZones();
                if (panelId === 'stats-content') displayStats();
            });
        });
    }

    // --- LÓGICA DEL JUEGO (PRINCIPAL) ---
    function startDrawing() {
        if (zonePoly) gameMap.removeLayer(zonePoly);
        if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
        zonePoints = []; tempMarkers = []; zonePoly = null;
        playing = false; drawing = true;
        updateInfoPanel('Haz clic para añadir vértices');
        updateActionBtn('Start', 'btn-green', () => preloadStreets(), true);
        poiSwitchContainer.classList.remove('hidden');
        gameMap.on('click', addVertex);
    }
    function addVertex(e) {
        if (zonePoints.length > 0 && e.latlng.equals(zonePoints[0]) && zonePoints.length >= 3) {
            finishPolygon();
            return;
        }
        const mk = L.circleMarker(e.latlng, { radius: 5, color: COL_ZONE }).addTo(gameMap);
        tempMarkers.push(mk);
        zonePoints.push(e.latlng);
        if (zonePoly) gameMap.removeLayer(zonePoly);
        zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
        if (zonePoints.length >= 3) {
            updateInfoPanel('Cierra la zona o pulsa Start');
            updateActionBtn('Start', 'btn-green', () => preloadStreets(), false);
        }
    }
    function finishPolygon() {
        drawing = false;
        gameMap.off('click', addVertex);
        tempMarkers.forEach(m => gameMap.removeLayer(m));
        tempMarkers = [];
        zonePoly.addLatLng(zonePoints[0]);
        updateInfoPanel('Zona cerrada. ¡Pulsa Start!');
    }
    async function preloadStreets() {
        if (!zonePoly) return;
        if (drawing) finishPolygon();
        poiSwitchContainer.classList.add('hidden');
        updateInfoPanel('Buscando lugares...');
        updateActionBtn('Cargando...', 'btn-gray', null, true);
        try {
            const zoneParam = zonePoints.map(p => `${p.lat},${p.lng}`).join(';');
            const includePOI = poiCheckbox.checked;
            //const response = await fetch(`/api/getStreets?zone=${encodeURIComponent(zoneParam)}&includePOI=${includePOI}`);
            //if (!response.ok) throw new Error((await response.json()).error || 'Error del servidor.');
            //const data = await response.json();
             const data = { streets: [{googleName: "Calle Falsa 123", geometries: [{isClosed: false, points: [[38.88, -6.97], [38.881, -6.971]]}]}] }; // Placeholder
            streetList = data.streets;
            totalQuestions = streetList.length;
            streetList.sort(() => Math.random() - 0.5);
            if (totalQuestions > 0) {
                updateInfoPanel(`¡${totalQuestions} lugares encontrados!`);
                updateActionBtn('Iniciar Juego', 'btn-green', () => {
                    playing = true;
                    qIdx = 0;
                    streetsGuessedCorrectly = 0;
                    progressBar.style.width = '0%';
                    progressBarContainer.classList.remove('hidden');
                    gameMap.fitBounds(zonePoly.getBounds(), { padding: [50, 50] });
                    nextQ();
                });
            } else {
                updateInfoPanel('No se encontraron lugares. Dibuja otra zona.');
                updateActionBtn('Establecer Zona', 'btn-blue', startDrawing);
            }
        } catch (error) {
            console.error(error);
            updateInfoPanel(`Error: ${error.message}`);
            updateActionBtn('Establecer Zona', 'btn-blue', startDrawing);
        }
    }
    function nextQ() {
        if(gameMap.hasLayer(userMk)) gameMap.removeLayer(userMk);
        if(gameMap.hasLayer(guide)) gameMap.removeLayer(guide);
        if(gameMap.hasLayer(streetGrp)) gameMap.removeLayer(streetGrp);
        if (qIdx >= totalQuestions) {
            endGame();
            return;
        }
        const s = streetList[qIdx];
        target = s.geometries;
        qIdx++;
        questionArea.classList.remove('hidden');
        streetNameText.textContent = s.googleName;
        streetNameText.parentElement.style.width = 'auto'; // Reset width
        const newWidth = streetNameText.scrollWidth;
        streetNameText.parentElement.style.width = newWidth + 'px'; // Set to new width
        streetNameText.parentElement.classList.add('pulse-animation');
        setTimeout(() => streetNameText.parentElement.classList.remove('pulse-animation'), 500);

        const progress = (qIdx / totalQuestions) * 100;
        progressBar.style.width = progress + '%';
        
        updateInfoPanel(`Aciertos: <span class="score">${streetsGuessedCorrectly} / ${totalQuestions}</span>`);
        updateActionBtn('Siguiente', 'btn-blue', () => nextQ(), true);
        gameMap.on('click', onMapClick);
    }
    function onMapClick(e) {
        if (!playing) return;
        gameMap.off('click', onMapClick);
        userMk = L.marker(e.latlng).addTo(gameMap);
        streetGrp = L.layerGroup().addTo(gameMap);
        target.forEach(geom => {
            const style = { color: COL_TRACE, weight: geom.isClosed ? 4 : 8, fillOpacity: 0.2 };
            const layer = geom.isClosed ? L.polygon(geom.points, style) : L.polyline(geom.points, style);
            layer.addTo(streetGrp).bringToFront();
        });
        
        // Animación de revelado
        streetGrp.eachLayer(layer => {
            if (layer.getElement) {
                layer.getElement().classList.add('street-reveal-animation');
            }
        });

        const userPoint = turf.point([e.latlng.lng, e.latlng.lat]);
        let isCorrect = false;
        target.forEach(geom => {
            const turfGeom = geom.isClosed ? 
                turf.polygon([geom.points.map(p => [p.lng, p.lat])]) : 
                turf.lineString(geom.points.map(p => [p.lng, p.lat]));
            
            if (geom.isClosed) {
                if (turf.booleanPointInPolygon(userPoint, turfGeom)) {
                    isCorrect = true;
                }
            } else {
                if (turf.pointToLineDistance(userPoint, turfGeom, { units: 'meters' }) < 20) {
                    isCorrect = true;
                }
            }
        });

        if (isCorrect) {
            streetsGuessedCorrectly++;
            showFeedbackPopup('¡Correcto!', 'correct');
            document.getElementById('correct-sound').play();
        } else {
            showFeedbackPopup('¡Cerca!', 'incorrect');
            document.getElementById('incorrect-sound').play();
        }
        
        updateInfoPanel(`Aciertos: <span class="score">${streetsGuessedCorrectly} / ${totalQuestions}</span>`);
        updateActionBtn('Siguiente', 'btn-blue', () => nextQ(), false);
    }
    function endGame() {
        playing = false;
        progressBarContainer.classList.add('hidden');
        questionArea.classList.add('hidden');
        showFeedbackPopup(`Fin del juego! Puntuación: ${streetsGuessedCorrectly} de ${totalQuestions}`, 'info');
        updateActionBtn('Nueva Zona', 'btn-blue', startDrawing);
        lastGameZonePoints = [...zonePoints];
        oldZonePoly = zonePoly;
        zonePoly = null;
    }
    async function submitIncidentReport() {
        const reportContent = reportTextarea.value;
        if (!reportContent.trim()) {
            alert('Por favor, describe la incidencia.');
            return;
        }
        const user = supabaseClient.auth.user();
        try {
            const { error } = await supabaseClient.from('incidents').insert([{
                user_id: user ? user.id : null,
                report: reportContent,
                location: userProfile.cityData ? userProfile.cityData.name : 'Desconocida',
                game_state: {
                    lastZone: lastGameZonePoints,
                    currentQuestion: streetList[qIdx - 1]
                }
            }]);
            if (error) throw error;
            reportModal.classList.add('hidden');
            reportTextarea.value = '';
            showFeedbackPopup('¡Gracias por tu ayuda!', 'info');
        } catch (error) {
            console.error('Error al enviar el reporte:', error);
            alert('No se pudo enviar el reporte. Inténtalo de nuevo.');
        }
    }
    
    // --- LÓGICA DE ZONAS GUARDADAS ---
    async function saveCurrentZone() {
        const user = supabaseClient.auth.user();
        if (!user || !zonePoly) return;
        const zoneName = prompt('Dale un nombre a esta zona:');
        if (!zoneName) return;

        const zoneGeoJSON = zonePoly.toGeoJSON();
        try {
            const { error } = await supabaseClient.from('saved_zones').insert([{
                user_id: user.id,
                name: zoneName,
                zone_geojson: zoneGeoJSON
            }]);
            if (error) throw error;
            showFeedbackPopup('Zona guardada con éxito', 'correct');
        } catch (error) {
            console.error('Error al guardar la zona:', error);
            showFeedbackPopup('Error al guardar la zona', 'incorrect');
        }
    }
    async function displaySavedZones() {
        const user = supabaseClient.auth.user();
        if (!user) return;
        const listContainer = document.getElementById('saved-zones-list');
        listContainer.innerHTML = 'Cargando tus zonas...';

        try {
            const { data: zones, error } = await supabaseClient.from('saved_zones').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
            if (error) throw error;

            if (zones.length === 0) {
                listContainer.innerHTML = '<p>No tienes ninguna zona guardada todavía.</p>';
                return;
            }
            listContainer.innerHTML = '';
            zones.forEach(zone => {
                const item = document.createElement('div');
                item.className = 'saved-zone-item';
                item.innerHTML = `<span>${zone.name}</span><button data-id="${zone.id}" class="delete-zone-btn">&times;</button>`;
                item.onclick = (e) => {
                    if (e.target.tagName !== 'BUTTON') {
                        loadZone(zone.zone_geojson);
                        menuOverlay.classList.add('hidden');
                    }
                };
                listContainer.appendChild(item);
            });

            listContainer.querySelectorAll('.delete-zone-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    if (confirm('¿Seguro que quieres borrar esta zona?')) {
                        await deleteZone(btn.dataset.id);
                        displaySavedZones();
                    }
                };
            });
        } catch (error) {
            listContainer.innerHTML = '<p>No se pudieron cargar las zonas.</p>';
            console.error('Error al mostrar zonas:', error);
        }
    }
    function loadZone(geojson) {
        if (zonePoly) gameMap.removeLayer(zonePoly);
        if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
        
        zonePoints = geojson.geometry.coordinates[0].map(p => L.latLng(p[1], p[0]));
        zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
        gameMap.fitBounds(zonePoly.getBounds(), { padding: [50, 50] });
        
        updateInfoPanel('Zona cargada. ¡Pulsa Start!');
        updateActionBtn('Start', 'btn-green', () => preloadStreets(), false);
        poiSwitchContainer.classList.remove('hidden');
        playing = false;
        drawing = false;
        progressBarContainer.classList.add('hidden');
        questionArea.classList.add('hidden');
    }
    async function deleteZone(zoneId) {
        try {
            const { error } = await supabaseClient.from('saved_zones').delete().eq('id', zoneId);
            if (error) throw error;
            showFeedbackPopup('Zona borrada', 'info');
        } catch (error) {
            console.error('Error al borrar la zona:', error);
            showFeedbackPopup('No se pudo borrar la zona', 'incorrect');
        }
    }

    // --- LÓGICA DE ESTADÍSTICAS ---
    async function displayStats() {
        const statsContainer = document.getElementById('stats-list');
        statsContainer.innerHTML = 'Cargando estadísticas...';
        // Implementar la lógica para cargar y mostrar estadísticas
        statsContainer.innerHTML = '<p>Próximamente...</p>';
    }
    
    // --- EVENT LISTENERS INICIALES ---
    googleLoginBtn.addEventListener('click', signInWithGoogle);
    supabaseClient.auth.onAuthStateChange(handleAuthStateChange);
});