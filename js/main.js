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
    const menuBtn = document.getElementById('menu-btn');
    const menuOverlay = document.getElementById('menu-overlay');
    const closeMenuBtn = document.getElementById('close-menu-btn');
    const reportModal = document.getElementById('report-modal');
    const cancelReportBtn = document.getElementById('cancel-report-btn');
    const submitReportBtn = document.getElementById('submit-report-btn');
    const reportTextarea = document.getElementById('report-textarea');

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
        if(disabled) mainActionBtn.classList.add('btn-gray');
    }
    
    // --- LÓGICA DE AUTENTICACIÓN Y PERFIL ---
    async function signInWithGoogle() { await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); }
    async function signOut() { await supabaseClient.auth.signOut(); }

    async function fetchUserProfile(user) {
        if (!user) return;
        try {
            const { data: profile, error } = await supabaseClient.from('profiles').select('role, subscribed_city').eq('id', user.id).single();
            if (error && error.code === 'PGRST116') return setTimeout(() => fetchUserProfile(user), 1000);
            if (error) throw error;
            userProfile = { ...userProfile, role: profile.role, subscribedCity: profile.subscribed_city };

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
        closeMenuBtn.onclick = () => menuOverlay.classList.add('hidden');
        
        const profilePanel = document.getElementById('profile-content');
        profilePanel.innerHTML = `<div id="profile-content-container"><p>Conectado como</p><p class="font-bold">${user.email}</p><button id="logout-btn">Cerrar Sesión</button></div>`;
        document.getElementById('logout-btn').onclick = signOut;
        
        document.querySelectorAll('.menu-tab-btn').forEach(button => {
            button.addEventListener('click', () => {
                const panelId = button.dataset.panel;
                document.querySelectorAll('.menu-tab-btn').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                document.querySelectorAll('.menu-panel').forEach(p => p.classList.remove('active'));
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

    function undoLastPoint() { /* Lógica de retroceso no aplica en este diseño simple */ }

    async function preloadStreets() {
        if (!zonePoly) return;
        if (drawing) finishPolygon();
        
        poiSwitchContainer.classList.add('hidden');
        updateInfoPanel('Buscando lugares...');
        updateActionBtn('Cargando...', 'btn-gray', null, true);

        try {
            const zoneParam = zonePoints.map(p => `${p.lat},${p.lng}`).join(';');
            const includePOI = poiCheckbox.checked;
            const response = await fetch(`/api/getStreets?zone=${encodeURIComponent(zoneParam)}&includePOI=${includePOI}`);
            if (!response.ok) throw new Error((await response.json()).error || 'Error del servidor.');
            
            const data = await response.json();
            streetList = data.streets;
            totalQuestions = streetList.length;
            streetList.sort(() => Math.random() - 0.5);

            if (totalQuestions > 0) {
                updateInfoPanel(`¡${totalQuestions} lugares encontrados!`);
                updateActionBtn('Iniciar Juego', 'btn-green', () => {
                    playing = true; qIdx = 0; streetsGuessedCorrectly = 0;
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
        streetNameText.parentElement.style.width = 'auto';
        const newWidth = streetNameText.scrollWidth;
        streetNameText.parentElement.style.width = newWidth + 'px';
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
            layer.addTo(streetGrp);
            try { if(layer.getElement()) layer.getElement().classList.add('street-reveal-animation'); } catch(e){}
        });

        const streetCheck = getDistanceToStreet(userMk.getLatLng(), streetGrp);
        if (streetCheck.distance <= 30) {
            streetsGuessedCorrectly++;
            showFeedbackPopup('¡Correcto!', 'correct');
            document.getElementById('correct-sound').play().catch(()=>{});
        } else {
            showFeedbackPopup(`Casi... a ${Math.round(streetCheck.distance)} metros`, 'incorrect');
            document.getElementById('incorrect-sound').play().catch(()=>{});
        }

        if (streetCheck.point) {
            guide = L.polyline([userMk.getLatLng(), streetCheck.point], { dashArray: '6 4', color: COL_DASH }).addTo(gameMap);
        }

        updateInfoPanel(`Aciertos: <span class="score">${streetsGuessedCorrectly} / ${totalQuestions}</span>`);
        updateActionBtn('Siguiente', 'btn-blue', () => nextQ(), false);
    }

    function endGame() {
        playing = false;
        questionArea.classList.add('hidden');
        progressBarContainer.classList.add('hidden');
        const finalPercentage = totalQuestions > 0 ? Math.round((streetsGuessedCorrectly/totalQuestions)*100) : 0;
        updateInfoPanel(`¡Partida terminada! <span class="score">${finalPercentage}%</span>`);
        if (zonePoly) {
            zonePoly.setStyle({ color: '#696969', dashArray: '5, 5', fillOpacity: 0.05 });
            oldZonePoly = zonePoly;
        }
        lastGameZonePoints = [...zonePoints];
        saveGameStats(streetsGuessedCorrectly, totalQuestions);
        updateActionBtn('Repetir Zona', 'btn-green', repeatLastZone);
    }
    
    function repeatLastZone() {
        if (lastGameZonePoints.length < 3) return;
        startDrawing();
        drawing = false;
        gameMap.off('click', addVertex);
        zonePoints = [...lastGameZonePoints];
        zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
        preloadStreets();
    }
    
    function getDistanceToStreet(userPoint, streetLayer) {
        let minDistance = Infinity, closestPointOnStreet = null;
        streetLayer.eachLayer(layer => {
            let latlngs = (layer instanceof L.Polygon) ? layer.getLatLngs()[0] : (layer instanceof L.Polyline) ? layer.getLatLngs() : [];
            for (let i = 0; i < latlngs.length - 1; i++) {
                let p1=gameMap.latLngToLayerPoint(latlngs[i]), p2=gameMap.latLngToLayerPoint(latlngs[i+1]), p=gameMap.latLngToLayerPoint(userPoint);
                let x=p1.x,y=p1.y,dx=p2.x-x,dy=p2.y-y;
                if(dx!==0||dy!==0){let t=((p.x-x)*dx+(p.y-y)*dy)/(dx*dx+dy*dy);if(t>1){x=p2.x;y=p2.y}else if(t>0){x+=dx*t;y+=dy*t}}
                dx=p.x-x;dy=p.y-y;let dist=dx*dx+dy*dy;
                if(dist<minDistance){minDistance=dist;closestPointOnStreet=gameMap.layerPointToLatLng(L.point(x,y))}
            }
        });
        return { distance: Math.sqrt(minDistance), point: closestPointOnStreet };
    }
    
    async function saveCurrentZone() { /* Esta función ya no se llama desde la UI principal */ }
    async function saveGameStats(correct, total) {
        if (total === 0) return;
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if(!session) return;
            await supabaseClient.from('game_stats').insert({ user_id: session.user.id, correct_guesses: correct, total_questions: total });
        } catch (error) { console.error('Error saving stats:', error.message); }
    }
    async function displaySavedZones() {
        const container = document.getElementById('saved-zones-content');
        container.innerHTML = '<p>Cargando...</p>';
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if(!session) return;
            const { data: zones, error } = await supabaseClient.from('saved_zones').select('id, name, zone_points').eq('user_id', session.user.id);
            if(error) throw error;
            container.innerHTML = zones.length > 0 ? zones.map(zone => `<div class="saved-zone-item" data-zone-points="${zone.zone_points}"><span>${zone.name}</span><button class="delete-zone-btn" data-zone-id="${zone.id}">&times;</button></div>`).join('') : '<p>No tienes zonas guardadas.</p>';
            
            container.querySelectorAll('.saved-zone-item').forEach(item => item.onclick = (e) => {
                if(e.target.classList.contains('delete-zone-btn')) return;
                menuOverlay.classList.add('hidden');
                lastGameZonePoints = item.dataset.zonePoints.split(';').map(p => { const [lat, lng] = p.split(','); return L.latLng(parseFloat(lat), parseFloat(lng)); });
                repeatLastZone();
            });
            container.querySelectorAll('.delete-zone-btn').forEach(btn => btn.onclick = async (e) => {
                if(!confirm('¿Eliminar esta zona?')) return;
                await supabaseClient.from('saved_zones').delete().eq('id', e.target.dataset.zoneId);
                displaySavedZones();
            });
        } catch(e) { container.innerHTML = '<p class="text-red-400">Error al cargar zonas.</p>'; }
    }
    async function displayStats() {
        const container = document.getElementById('stats-content');
        container.innerHTML = '<p>Cargando...</p>';
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if(!session) return;
            const { data: stats, error } = await supabaseClient.from('game_stats').select('correct_guesses, total_questions').eq('user_id', session.user.id);
            if (error) throw error;
            if(stats.length === 0) { container.innerHTML = '<p>Juega una partida para ver tus estadísticas.</p>'; return; }

            const totalCorrect = stats.reduce((sum, game) => sum + game.correct_guesses, 0);
            const totalPlayed = stats.reduce((sum, game) => sum + game.total_questions, 0);
            const percentage = totalPlayed > 0 ? Math.round((totalCorrect / totalPlayed) * 100) : 0;
            container.innerHTML = `<div class="stats-container"><div class="stats-percentage">${percentage}%</div><div>de aciertos</div><div class="text-sm text-gray-400">(${totalCorrect} de ${totalPlayed} en total)</div></div>`;
        } catch (e) { container.innerHTML = '<p class="text-red-400">Error al cargar estadísticas.</p>'; }
    }
    async function submitIncidentReport() {
        if (lastGameZonePoints.length === 0) {
            showFeedbackPopup("Juega en una zona para poder reportar", "incorrect");
            return;
        }
        const description = reportTextarea.value;
        if (!description?.trim()) {
            showFeedbackPopup("La descripción no puede estar vacía", "incorrect");
            return;
        }

        try {
            submitReportBtn.disabled = true;
            submitReportBtn.textContent = 'Enviando...';
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) { showFeedbackPopup("Necesitas estar conectado", "incorrect"); return; }
            const zoneString = lastGameZonePoints.map(p => `${p.lat},${p.lng}`).join(';');
            const response = await fetch('/api/reportIncident', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ zone_points: zoneString, description: description, city: userProfile.subscribedCity })
            });
            if (!response.ok) throw new Error((await response.json()).error || 'Error del servidor');
            showFeedbackPopup("¡Gracias! Incidencia enviada", "correct");
            reportModal.classList.add('hidden');
            reportTextarea.value = '';
        } catch (error) {
            console.error('Error al enviar la incidencia:', error.message);
            showFeedbackPopup(`Error: ${error.message}`, "incorrect");
        } finally {
            submitReportBtn.disabled = false;
            submitReportBtn.textContent = 'Enviar';
        }
    }

    // --- INICIO ---
    googleLoginBtn.addEventListener('click', signInWithGoogle);
    supabaseClient.auth.onAuthStateChange(handleAuthStateChange);
});