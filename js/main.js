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
    
    // Nuevos elementos de la UI
    const reportIncidentBtn = document.getElementById('report-incident-btn');
    const questionArea = document.getElementById('question-area');
    const streetNameBox = document.getElementById('street-name-box');
    const streetNameText = document.getElementById('street-name-text');
    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');
    const infoText = document.getElementById('info-text');
    const poiSwitchContainer = document.getElementById('poi-switch-container');
    const poiCheckbox = document.getElementById('poi-checkbox');
    const actionsContainer = document.getElementById('actions-container');
    const feedbackPopup = document.getElementById('feedback-popup');
    const feedbackText = document.getElementById('feedback-text');
    const menuBtn = document.getElementById('menu-btn');
    const menuOverlay = document.getElementById('menu-overlay');
    const closeMenuBtn = document.getElementById('close-menu-btn');

    // --- VARIABLES DE ESTADO DEL JUEGO ---
    let gameMap = null;
    let backgroundMap = null;
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
    
    function updateActionButtons(state) {
        actionsContainer.innerHTML = '';
        actionsContainer.className = '';
        poiSwitchContainer.classList.add('hidden');
    
        const createButton = (id, icon, color, btnClass, clickHandler) => {
            const btn = document.createElement('button');
            btn.id = id;
            btn.className = `action-btn ${color} ${btnClass}`;
            btn.innerHTML = icon;
            btn.onclick = clickHandler;
            actionsContainer.appendChild(btn);
            return btn;
        };
    
        const icons = {
            draw: `<svg viewBox="0 0 24 24"><path d="M12 20h9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>`,
            undo: `<svg viewBox="0 0 24 24"><path d="M21 7v6h-6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l-3 2.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>`,
            start: `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></polygon></svg>`,
            next: `<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></polyline></svg>`,
            loading: `<svg class="animate-spin" viewBox="0 0 24 24" style="animation: spin 1s linear infinite;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>`,
            repeat: `<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></polyline><path d="M1 20v-6a8 8 0 0 1 8-8 8 8 0 0 1 8 8v1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><polyline points="1 14 1 20 7 20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></polyline><path d="M23 10a8 8 0 0 1-8 8 8 8 0 0 1-8-8v-1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>`,
            save: `<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><polyline points="17 21 17 13 7 13 7 21" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></polyline><polyline points="7 3 7 8 15 8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></polyline></svg>`
        };
    
        switch (state) {
            case 'initial':
                createButton('drawZoneBtn', icons.draw, 'btn-blue', 'main-btn', startDrawing);
                break;
            case 'drawing':
                actionsContainer.classList.add('split-2');
                poiSwitchContainer.classList.remove('hidden');
                const startBtn = createButton('startBtn', icons.start, 'btn-green', 'btn-2', () => preloadStreets());
                startBtn.disabled = zonePoints.length < 3;
                if(startBtn.disabled) startBtn.classList.add('btn-gray');
                createButton('undoBtn', icons.undo, 'btn-red', 'btn-1', undoLastPoint);
                break;
            case 'loading':
                createButton('loadingBtn', icons.loading, 'btn-gray', 'main-btn', null).disabled = true;
                break;
            case 'game_ready':
                createButton('startGameBtn', icons.start, 'btn-green', 'main-btn', () => {
                    playing = true; qIdx = 0; streetsGuessedCorrectly = 0;
                    progressBar.style.width = '0%';
                    progressBarContainer.classList.remove('hidden');
                    gameMap.fitBounds(zonePoly.getBounds(), { padding: [50, 50] });
                    nextQ();
                });
                break;
            case 'playing':
                 const nextBtn = createButton('nextBtn', icons.next, 'btn-blue', 'main-btn', () => nextQ());
                 nextBtn.disabled = true; nextBtn.classList.add('btn-gray');
                 break;
            case 'end_game':
                actionsContainer.classList.add('split-3');
                createButton('saveZoneBtn', icons.save, 'btn-yellow', 'btn-1', saveCurrentZone);
                createButton('repeatZoneBtn', icons.repeat, 'btn-green', 'btn-2', repeatLastZone);
                createButton('drawZoneBtn', icons.draw, 'btn-blue', 'btn-3', startDrawing);
                break;
        }
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
        } catch (e) {
            console.error("Error fetching user profile:", e);
        }
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
    
    // --- INICIALIZACIÓN DE MAPAS Y MENÚ ---
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
        updateActionButtons('initial');
        reportIncidentBtn.onclick = reportIncident;
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
        updateActionButtons('drawing');
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
            document.getElementById('startBtn').disabled = false;
            document.getElementById('startBtn').classList.remove('btn-gray');
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

    function undoLastPoint() {
        if (!drawing || zonePoints.length === 0) return;
        zonePoints.pop();
        const lastMarker = tempMarkers.pop();
        if (lastMarker) gameMap.removeLayer(lastMarker);
        if (zonePoly) gameMap.removeLayer(zonePoly);
        zonePoly = null;
        if (zonePoints.length >= 2) {
            zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
        }
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = zonePoints.length < 3;
            if(startBtn.disabled) {
                startBtn.classList.add('btn-gray');
            } else {
                startBtn.classList.remove('btn-gray');
            }
        }
        updateInfoPanel(zonePoints.length > 0 ? 'Punto eliminado' : 'Haz clic para añadir vértices');
    }

    async function preloadStreets() {
        if (!zonePoly) return;
        if (drawing) finishPolygon();
        
        updateInfoPanel('Buscando lugares...');
        updateActionButtons('loading');

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
                updateActionButtons('game_ready');
            } else {
                updateInfoPanel('No se encontraron lugares. Dibuja otra zona.');
                updateActionButtons('initial');
            }
        } catch (error) {
            console.error(error);
            updateInfoPanel(`Error: ${error.message}`);
            updateActionButtons('initial');
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
        
        // Animación de la pregunta
        questionArea.classList.remove('hidden');
        streetNameText.textContent = s.googleName;
        streetNameBox.style.width = 'auto';
        const newWidth = streetNameText.scrollWidth;
        streetNameBox.style.width = newWidth + 'px';
        streetNameBox.classList.add('pulse-animation');
        setTimeout(() => streetNameBox.classList.remove('pulse-animation'), 500);
        
        // Actualización de la barra de progreso
        const progress = (qIdx / totalQuestions) * 100;
        progressBar.style.width = progress + '%';

        updateInfoPanel(`Aciertos: <span class="score">${streetsGuessedCorrectly} / ${totalQuestions}</span>`);
        updateActionButtons('playing');
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
            if(layer.getElement()) layer.getElement().classList.add('street-reveal-animation');
        });

        const streetCheck = getDistanceToStreet(userMk.getLatLng(), streetGrp);
        if (streetCheck.distance <= 30) {
            streetsGuessedCorrectly++;
            showFeedbackPopup('¡Correcto!', 'correct');
            document.getElementById('correct-sound').play().catch(()=>{});
        } else {
            showFeedbackPopup('Casi...', 'incorrect');
            document.getElementById('incorrect-sound').play().catch(()=>{});
        }

        if (streetCheck.point) {
            guide = L.polyline([userMk.getLatLng(), streetCheck.point], { dashArray: '6 4', color: COL_DASH }).addTo(gameMap);
        }

        updateInfoPanel(`Aciertos: <span class="score">${streetsGuessedCorrectly} / ${totalQuestions}</span>`);
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.classList.remove('btn-gray');
        }
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
        updateActionButtons('end_game');
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
    
    // --- LÓGICA DE APOYO (Distancia, Guardado, Estadísticas, Reporte) ---
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
    
    async function saveCurrentZone() {
        const zoneName = prompt("Dale un nombre a esta zona:", "Mi barrio");
        if (!zoneName?.trim()) return;
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if(!session) return;
            const zoneString = lastGameZonePoints.map(p => `${p.lat},${p.lng}`).join(';');
            await supabaseClient.from('saved_zones').insert({ user_id: session.user.id, name: zoneName, zone_points: zoneString });
            showFeedbackPopup('¡Zona guardada!', 'correct');
        } catch (error) {
            showFeedbackPopup('Error al guardar', 'incorrect');
        }
    }

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
    
    async function reportIncident() {
        if (lastGameZonePoints.length === 0) {
            showFeedbackPopup("Juega en una zona para poder reportar", "incorrect");
            return;
        }
        const description = prompt("Por favor, describe la incidencia (ej. 'Falta la calle X', 'La calle Y no debería estar', etc.):");
        if (!description?.trim()) return;

        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) { showFeedbackPopup("Necesitas estar conectado para reportar", "incorrect"); return; }
            const zoneString = lastGameZonePoints.map(p => `${p.lat},${p.lng}`).join(';');
            const response = await fetch('/api/reportIncident', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ zone_points: zoneString, description: description, city: userProfile.subscribedCity })
            });
            if (!response.ok) throw new Error((await response.json()).error || 'Error del servidor');
            showFeedbackPopup("¡Gracias! Incidencia enviada", "correct");
        } catch (error) {
            console.error('Error al enviar la incidencia:', error.message);
            showFeedbackPopup(`Error: ${error.message}`, "incorrect");
        }
    }

    // --- INICIO ---
    googleLoginBtn.addEventListener('click', signInWithGoogle);
    supabaseClient.auth.onAuthStateChange(handleAuthStateChange);
});