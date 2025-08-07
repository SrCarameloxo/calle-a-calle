document.addEventListener('DOMContentLoaded', () => {

    const SUPABASE_URL = 'https://rwnzpuwzoqpwzdeqfגיד.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bnpwdXd6b3Fwd3pkZXFmZ3pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTI2MDM2MjEsImV4cCI6MjAyODE3OTYyMX0.COmU2m_j2SooXp4jP-9m2i4f-2h2o_g2D0bXkCh71sU';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    const loginScreen = document.getElementById('login-screen');
    const gameScreen = document.getElementById('game-screen');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfoDetails = document.getElementById('user-info-details');
    const adminPanelBtn = document.getElementById('admin-panel-btn');

    const drawZoneBtn = document.getElementById('drawZone');
    const undoPointBtn = document.getElementById('undoPoint');
    const startBtn = document.getElementById('start');
    const nextBtn = document.getElementById('next');
    const repeatZoneBtn = document.getElementById('repeatZone');
    const saveZoneBtn = document.getElementById('saveZoneBtn');
    const questionEl = document.getElementById('question');
    const scoreDisplay = document.getElementById('score-display');
    const scoreEl = document.getElementById('score');
    const feedbackEl = document.getElementById('fb');
    const loader = document.getElementById('loader-container');
    const loadingText = document.getElementById('loading-text');
    const startOptions = document.getElementById('start-options');
    const includePOICheckbox = document.getElementById('include-poi-checkbox');

    const openMenuBtn = document.getElementById('open-menu-btn');
    const menuContentPanel = document.getElementById('menu-content-panel');
    const reportBtnFAB = document.getElementById('report-btn-fab');


    let map;
    let polygon;
    let markers = [];
    let currentStreetIndex = 0;
    let streetsData = [];
    let score = 0;
    let polylines = [];
    let isDrawing = false;
    let lastGameZonePoints = null;

    const correctSound = document.getElementById('correct-sound');
    const incorrectSound = document.getElementById('incorrect-sound');

    function initializeMap(center = [38.92, -6.97]) {
        if (!map) {
            map = L.map('game-map-container', { zoomControl: false }).setView(center, 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 20
            }).addTo(map);

            const backgroundMap = L.map('background-map', {
                zoomControl: false,
                attributionControl: false
            }).setView(center, 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
                subdomains: 'abcd'
            }).addTo(backgroundMap);
        }
    }

    // --- Lógica de Autenticación y Perfil ---
    async function setupUIBasedOnSession() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            loginScreen.classList.add('hidden');
            gameScreen.classList.remove('hidden');
            initializeMap();
            displayUserInfo(session.user);
            setupGameListeners();
            checkAdminRole(session.user);
        } else {
            loginScreen.classList.remove('hidden');
            gameScreen.classList.add('hidden');
        }
    }

    function displayUserInfo(user) {
        if (!user) return;
        const profileImageUrl = user.user_metadata?.avatar_url || 'default-avatar.png';
        const userName = user.user_metadata?.full_name || user.email;
        userInfoDetails.innerHTML = `
            <img src="${profileImageUrl}" alt="Avatar" class="w-20 h-20 mx-auto mb-4 rounded-full">
            <p class="font-bold text-lg">${userName}</p>
        `;
    }

    async function checkAdminRole(user) {
        const { data, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (data && data.role === 'admin') {
            adminPanelBtn.classList.remove('hidden');
        }
    }

    googleLoginBtn.addEventListener('click', async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.href }
        });
    });

    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.reload();
    });

    adminPanelBtn.addEventListener('click', () => {
        window.open('/admin.html', '_blank');
    });

    // --- Lógica del Menú Inferior ---
    function setupMenuListeners() {
        const tabs = document.querySelectorAll('.menu-tab-btn');
        const contentPanels = document.querySelectorAll('.content-panel');

        openMenuBtn.addEventListener('click', () => {
            menuContentPanel.classList.toggle('hidden');
        });

        tabs.forEach(tab => {
            tab.addEventListener('click', async () => {
                const targetPanelId = tab.dataset.panel;

                // Actualizar estado activo de pestañas
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Mostrar el panel de contenido correcto
                contentPanels.forEach(panel => {
                    panel.classList.toggle('active', panel.id === targetPanelId);
                });

                // Cargar datos si es necesario
                if (targetPanelId === 'stats-content') await displayStats();
                if (targetPanelId === 'saved-zones-content') await displaySavedZones();
            });
        });
    }

    // --- Lógica principal del juego ---
    function setupGameListeners() {
        drawZoneBtn.addEventListener('click', startDrawing);
        undoPointBtn.addEventListener('click', undoLastPoint);
        startBtn.addEventListener('click', fetchStreets);
        nextBtn.addEventListener('click', nextStreet);
        repeatZoneBtn.addEventListener('click', repeatLastZone);
        saveZoneBtn.addEventListener('click', saveCurrentZone);
        reportBtnFAB.addEventListener('click', reportIncident);
    }

    function startDrawing() {
        resetGameState();
        isDrawing = true;
        drawZoneBtn.classList.add('hidden');
        startOptions.classList.add('hidden');
        undoPointBtn.classList.remove('hidden');
        map.on('click', onMapClick);
        feedbackEl.textContent = 'Haz clic en el mapa para definir los vértices de tu zona de juego.';
    }
    
    function onMapClick(e) {
        if (!isDrawing) return;
        const marker = L.marker(e.latlng).addTo(map);
        markers.push(marker);
        updatePolygon();
        startBtn.disabled = markers.length < 3;
        if (markers.length >= 3) {
            startOptions.classList.remove('hidden');
        }
    }

    function updatePolygon() {
        const latlngs = markers.map(m => m.getLatLng());
        if (polygon) {
            map.removeLayer(polygon);
        }
        if (latlngs.length > 1) {
            polygon = L.polygon(latlngs, { color: 'blue' }).addTo(map);
        }
    }

    function undoLastPoint() {
        if (markers.length > 0) {
            const lastMarker = markers.pop();
            map.removeLayer(lastMarker);
            updatePolygon();
        }
        startBtn.disabled = markers.length < 3;
        if (markers.length < 3) {
            startOptions.classList.add('hidden');
        }
    }

    async function fetchStreets() {
        if (markers.length < 3) return;
        isDrawing = false;
        map.off('click', onMapClick);
        
        showLoader('Analizando la zona y buscando calles...');
        
        lastGameZonePoints = markers.map(m => m.getLatLng());
        const zoneQuery = lastGameZonePoints.map(p => `${p.lat},${p.lng}`).join(';');
        const includePOI = includePOICheckbox.checked;

        try {
            const response = await fetch(`/.netlify/functions/getStreets?zone=${zoneQuery}&includePOI=${includePOI}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || 'Error al obtener las calles.');
            }
            const data = await response.json();
            
            if (data.streets && data.streets.length > 0) {
                streetsData = data.streets;
                startGame();
            } else {
                feedbackEl.textContent = 'No se encontraron calles en la zona seleccionada. Por favor, define otra zona.';
                resetToDrawState();
            }
        } catch (error) {
            console.error('Fetch error:', error);
            feedbackEl.textContent = `Error: ${error.message}`;
            resetToDrawState();
        } finally {
            hideLoader();
        }
    }
    
    function showLoader(text) {
        loadingText.textContent = text;
        loader.classList.remove('hidden');
        drawZoneBtn.disabled = true;
        startBtn.disabled = true;
        undoPointBtn.disabled = true;
    }

    function hideLoader() {
        loader.classList.add('hidden');
        drawZoneBtn.disabled = false;
    }

    function startGame() {
        currentStreetIndex = 0;
        score = 0;
        updateScore();
        
        // Ocultar marcadores y polígono de la zona
        markers.forEach(m => map.removeLayer(m));
        if (polygon) map.removeLayer(polygon);
        markers = [];
        polygon = null;

        // Ocultar botones de configuración y mostrar los de juego
        drawZoneBtn.classList.add('hidden');
        undoPointBtn.classList.add('hidden');
        startOptions.classList.add('hidden');
        nextBtn.classList.remove('hidden');
        nextBtn.disabled = false;
        saveZoneBtn.classList.remove('hidden');
        repeatZoneBtn.classList.remove('hidden');
        repeatZoneBtn.disabled = false;
        
        feedbackEl.textContent = '';
        scoreDisplay.classList.remove('hidden');

        askQuestion();
    }

    function askQuestion() {
        clearMapGeometries();
        const street = streetsData[currentStreetIndex];
        questionEl.textContent = `¿Dónde está: ${street.googleName}?`;
        map.on('click', checkAnswer);
    }

    function checkAnswer(e) {
        const point = L.latLng(e.lat, e.lng);
        const street = streetsData[currentStreetIndex];
        let isCorrect = false;

        for (const geometry of street.geometries) {
            const latlngs = geometry.points.map(p => [p[0], p[1]]);
            if (geometry.isClosed) {
                const poly = L.polygon(latlngs);
                if (isPointInPolygon(point, poly)) {
                    isCorrect = true;
                    break;
                }
            } else {
                const polyline = L.polyline(latlngs);
                if (isPointNearPolyline(point, polyline, map.getZoom())) {
                    isCorrect = true;
                    break;
                }
            }
        }

        revealStreet(street, isCorrect);

        if (isCorrect) {
            score++;
            correctSound.play();
        } else {
            incorrectSound.play();
        }
        
        updateScore();
        map.off('click', checkAnswer);
    }

    function revealStreet(street, isCorrect) {
        const color = isCorrect ? '#28a745' : '#dc3545';
        street.geometries.forEach(geometry => {
            const latlngs = geometry.points.map(p => [p[0], p[1]]);
            const polyline = L.polyline(latlngs, {
                color: color,
                weight: 8,
                opacity: 0.8
            }).addTo(map);
            
            // Aplicar animación
            const path = polyline.getElement();
            if(path) {
                path.classList.add('street-reveal-animation');
                path.addEventListener('animationend', () => {
                    path.classList.remove('street-reveal-animation');
                });
            }

            polylines.push(polyline);
        });
    }

    function nextStreet() {
        currentStreetIndex++;
        if (currentStreetIndex < streetsData.length) {
            askQuestion();
        } else {
            endGame();
        }
    }

    function endGame() {
        questionEl.textContent = `¡Juego terminado! Puntuación final: ${score} / ${streetsData.length}`;
        nextBtn.disabled = true;
        reportBtnFAB.classList.remove('hidden'); // Mostrar botón de reporte
    }

    function clearMapGeometries() {
        polylines.forEach(p => map.removeLayer(p));
        polylines = [];
    }

    function resetGameState() {
        clearMapGeometries();
        markers.forEach(m => map.removeLayer(m));
        if (polygon) map.removeLayer(polygon);
        
        markers = [];
        polygon = null;
        streetsData = [];
        currentStreetIndex = 0;
        score = 0;
        isDrawing = false;
        
        questionEl.textContent = '';
        feedbackEl.textContent = '';
        scoreDisplay.classList.add('hidden');
        nextBtn.classList.add('hidden');
        repeatZoneBtn.classList.add('hidden');
        saveZoneBtn.classList.add('hidden');
        undoPointBtn.classList.add('hidden');
        reportBtnFAB.classList.add('hidden'); // Ocultar botón de reporte al reiniciar
        
        drawZoneBtn.classList.remove('hidden');
        drawZoneBtn.disabled = false;
        startBtn.disabled = true;
        
        map.off('click');
    }

    function resetToDrawState() {
        resetGameState();
        startDrawing();
    }
    
    function repeatLastZone() {
        if (!lastGameZonePoints) {
            feedbackEl.textContent = "No hay una zona anterior para repetir.";
            return;
        }
        resetGameState();
        // Simular clics para volver a dibujar la zona
        lastGameZonePoints.forEach(latlng => {
             const marker = L.marker(latlng).addTo(map);
             markers.push(marker);
        });
        updatePolygon();
        map.fitBounds(L.polygon(lastGameZonePoints).getBounds().pad(0.1));
        startBtn.disabled = false;
        startOptions.classList.remove('hidden');
        undoPointBtn.classList.remove('hidden');
    }


    // --- Lógica de Zonas Guardadas ---
    async function saveCurrentZone() {
        if (!lastGameZonePoints) {
            alert('No hay una zona activa para guardar.');
            return;
        }

        const zoneName = prompt('Introduce un nombre para esta zona:');
        if (!zoneName) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            alert('Debes iniciar sesión para guardar una zona.');
            return;
        }
        
        // Convertir los puntos a un formato simple
        const pointsToSave = lastGameZonePoints.map(p => ({ lat: p.lat, lng: p.lng }));

        const { error } = await supabase
            .from('saved_zones')
            .insert([{
                user_id: user.id,
                name: zoneName,
                zone_points: pointsToSave
            }]);

        if (error) {
            alert('Error al guardar la zona: ' + error.message);
        } else {
            alert('¡Zona guardada con éxito!');
            await displaySavedZones(); // Actualizar la lista
        }
    }

    async function displaySavedZones() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: zones, error } = await supabase
            .from('saved_zones')
            .select('*')
            .eq('user_id', user.id);
        
        const listEl = document.getElementById('saved-zones-list');
        listEl.innerHTML = ''; // Limpiar lista

        if (error) {
            listEl.innerHTML = '<p>Error al cargar las zonas.</p>';
            return;
        }
        if (zones.length === 0) {
            listEl.innerHTML = '<p>No tienes zonas guardadas.</p>';
            return;
        }

        zones.forEach(zone => {
            const itemEl = document.createElement('div');
            itemEl.className = 'saved-zone-item';
            itemEl.innerHTML = `
                <span>${zone.name}</span>
                <button class="delete-zone-btn" data-zone-id="${zone.id}">&times;</button>
            `;
            itemEl.addEventListener('click', (e) => {
                if (!e.target.classList.contains('delete-zone-btn')) {
                    loadZone(zone.zone_points);
                }
            });

            itemEl.querySelector('.delete-zone-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                const zoneId = e.target.dataset.zoneId;
                if (confirm('¿Seguro que quieres eliminar esta zona?')) {
                    await deleteZone(zoneId);
                }
            });

            listEl.appendChild(itemEl);
        });
    }

    function loadZone(points) {
        resetGameState();
        menuContentPanel.classList.add('hidden'); // Ocultar el menú al cargar una zona

        lastGameZonePoints = points.map(p => L.latLng(p.lat, p.lng));
        
        lastGameZonePoints.forEach(latlng => {
            const marker = L.marker(latlng).addTo(map);
            markers.push(marker);
        });
        
        updatePolygon();
        map.fitBounds(L.polygon(lastGameZonePoints).getBounds().pad(0.1));
        
        startBtn.disabled = false;
        startOptions.classList.remove('hidden');
        undoPointBtn.classList.remove('hidden');
    }

    async function deleteZone(zoneId) {
        const { error } = await supabase
            .from('saved_zones')
            .delete()
            .eq('id', zoneId);
        
        if (error) {
            alert('Error al eliminar la zona: ' + error.message);
        } else {
            await displaySavedZones(); // Recargar la lista
        }
    }


    // --- Lógica de Estadísticas e Incidentes ---
    async function displayStats() {
      // Implementación futura
      document.getElementById('stats-list').innerHTML = '<p>Las estadísticas estarán disponibles próximamente.</p>';
    }

    async function reportIncident() {
        const description = prompt("Por favor, describe el problema que encontraste (ej. 'El nombre de esta calle es incorrecto', 'Esta calle no debería aparecer', etc.):");
        if (!description) return;

        if (!lastGameZonePoints) {
            alert("No hay una zona de juego activa para reportar.");
            return;
        }
        
        // Obtener la ciudad de la zona para añadirla al reporte
        let city = 'Desconocida';
        try {
            const centerPoint = L.polygon(lastGameZonePoints).getBounds().getCenter();
            const response = await fetch(`/.netlify/functions/geocode?latlng=${centerPoint.lat},${centerPoint.lng}`);
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                const addressComponents = data.results[0].address_components;
                const cityComponent = addressComponents.find(c => c.types.includes('locality'));
                if (cityComponent) {
                    city = cityComponent.long_name;
                }
            }
        } catch (e) {
            console.error("Error geocodificando la ciudad:", e);
        }


        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            alert("Error de autenticación. Por favor, inicia sesión de nuevo.");
            return;
        }

        const response = await fetch('/.netlify/functions/reportIncident', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.accessToken}`
            },
            body: JSON.stringify({
                zone_points: lastGameZonePoints,
                description: description,
                city: city
            })
        });

        if (response.ok) {
            alert("Incidencia reportada con éxito. ¡Gracias por tu ayuda!");
        } else {
            const errorData = await response.json();
            alert("Error al reportar la incidencia: " + (errorData.error || 'Error desconocido'));
        }
    }


    // --- Funciones de ayuda geométricas ---
    function isPointInPolygon(point, polygon) {
        const vs = polygon.getLatLngs()[0];
        const x = point.lat, y = point.lng;
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i].lat, yi = vs[i].lng;
            const xj = vs[j].lat, yj = vs[j].lng;
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function isPointNearPolyline(point, polyline, zoom) {
        const tolerance = 15 / (1 << zoom); // Tolerancia en grados, ajustada por zoom
        return L.GeometryUtil.isNear(map, polyline, point, tolerance);
    }

    // --- Inicialización ---
    setupUIBasedOnSession();
    setupMenuListeners();
});