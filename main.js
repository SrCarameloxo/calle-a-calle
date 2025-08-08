window.addEventListener('DOMContentLoaded', () => {

  const SUPABASE_URL = 'https://hppzwfwtedghpsxfonoh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjQzNDMsImV4cCI6MjA2OTcwMDM0M30.BAh6i5iJ5YkDBoydfkC9azAD4eMdYBkEBdxws9kj5Hg';
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- Selectores de elementos DOM ---
  const loginScreen = document.getElementById('login-screen');
  const gameScreen = document.getElementById('game-screen');
  const backgroundMapContainer = document.getElementById('background-map');
  const googleLoginBtn = document.getElementById('google-login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userInfoDetails = document.getElementById('user-info-details');
  const adminPanelBtn = document.getElementById('admin-panel-btn');
  const gameUiContainer = document.getElementById('game-ui-container');
  const drawZoneBtn = document.getElementById('drawZone');
  const undoPointBtn = document.getElementById('undoPoint');
  const startBtn = document.getElementById('start');
  const nextBtn = document.getElementById('next');
  const repeatZoneBtn = document.getElementById('repeatZone');
  const saveZoneBtn = document.getElementById('saveZoneBtn');
  const questionEl = document.getElementById('question');
  const scoreDisplay = document.getElementById('score-display');
  const scoreEl = document.getElementById('score');
  const fbEl = document.getElementById('fb');
  const loaderContainer = document.getElementById('loader-container');
  const startOptions = document.getElementById('start-options');
  const includePOICheckbox = document.getElementById('include-poi-checkbox');
  const openMenuBtn = document.getElementById('open-menu-btn');
  const menuContentPanel = document.getElementById('menu-content-panel');
  const reportBtnFAB = document.getElementById('report-btn-fab');
  const loadedZoneOptions = document.getElementById('loaded-zone-options');
  const startLoadedZoneBtn = document.getElementById('startLoadedZone');
  const drawNewZoneBtn = document.getElementById('drawNewZone');
  const checkboxWrapper = document.querySelector('.checkbox-wrapper');

  let backgroundMap, gameMap = null;
  const COL_ZONE = '#663399', COL_TRACE = '#007a2f', COL_DASH = '#1976d2';
  let drawing=false, zonePoly=null, tempMarkers=[], zonePoints=[], oldZonePoly=null;
  let playing=false, qIdx=0, target=null, userMk, guide, streetGrp;
  let streetList = [], totalQuestions = 0, streetsGuessedCorrectly = 0, lastGameZonePoints = [];
  let lastGameStreetList = [];
  let userProfile = { cityData: null, subscribedCity: null, role: null };

  // --- Función para la animación inteligente del panel ---
  function updatePanelUI(updateFunction) {
      const heightBefore = gameUiContainer.offsetHeight;
      updateFunction(); // Ejecuta los cambios de UI
      const heightAfter = gameUiContainer.offsetHeight;

      if (heightBefore !== heightAfter) {
          gameUiContainer.classList.add('panel-pulse');
          setTimeout(() => {
              gameUiContainer.classList.remove('panel-pulse');
          }, 400);
      }
  }

  async function signInWithGoogle() { 
    await supabaseClient.auth.signInWithOAuth({ 
      provider: 'google',
      options: { redirectTo: window.location.origin }
    }); 
  }
  async function signOut() { await supabaseClient.auth.signOut(); }
  
  async function fetchUserProfile(user) {
    if (!user) return;
    try {
        const { data: profile, error } = await supabaseClient.from('profiles').select('role, subscribed_city').eq('id', user.id).single();
        if (error) {
            if (error.code === 'PGRST116') {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return fetchUserProfile(user);
            }
            throw error;
        }
        userProfile.role = profile.role;
        userProfile.subscribedCity = profile.subscribed_city;
        if (profile.role === 'admin') {
            adminPanelBtn.classList.remove('hidden');
        }
        if (profile.subscribed_city) {
            const { data: city, error: cityError } = await supabaseClient.from('cities').select('*').eq('name', profile.subscribed_city).single();
            if (cityError) throw new Error(`No se encontraron datos para la ciudad: ${profile.subscribed_city}`);
            userProfile.cityData = city;
        }
    } catch (e) {
        console.error("Error al obtener el perfil y la ciudad del usuario:", e);
        alert("Hubo un problema al cargar los datos de tu ciudad. Contacta con soporte.");
    }
  }

  async function handleAuthStateChange(event, session) {
    const user = session ? session.user : null;
    if (user) {
      const userName = user.user_metadata?.full_name || user.email.split('@')[0];
      const profileImageUrl = user.user_metadata?.avatar_url || '';
      userInfoDetails.innerHTML = `
        ${profileImageUrl ? `<img src="${profileImageUrl}" alt="Avatar" class="w-16 h-16 mx-auto mb-3 rounded-full">` : ''}
        <p class="font-semibold text-lg truncate">${userName}</p>
        <p class="text-sm text-gray-400">${user.email}</p>
      `;
      loginScreen.style.opacity = '0';
      gameScreen.classList.remove('hidden');
      logoutBtn.addEventListener('click', signOut);
      setTimeout(async () => {
          loginScreen.classList.add('hidden');
          await fetchUserProfile(user);
          if (!gameMap) initGame();
          setTimeout(() => gameMap.invalidateSize(), 100);
      }, 500);
    } else {
      loginScreen.classList.remove('hidden');
      loginScreen.style.opacity = '1';
      gameScreen.classList.add('hidden');
      if (!backgroundMap) initBackgroundMap();
    }
  }

  function startDynamicBackground(bMap) {
      const initialCenter = bMap.getCenter();
      const startTime = Date.now();
      const freqX = 0.00005, freqY = 0.0001, ampX = 0.008, ampY = 0.004;
      setInterval(() => {
          const elapsedTime = Date.now() - startTime;
          const dx = Math.sin(elapsedTime * freqX) * ampX;
          const dy = Math.cos(elapsedTime * freqY) * ampY;
          bMap.panTo([initialCenter.lat + dy, initialCenter.lng + dx], { animate: true, duration: 1, noMoveStart: true });
      }, 100);
  }

  function initBackgroundMap() {
      if (backgroundMap) return;
      backgroundMap = L.map('background-map', { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', { attribution: '', maxZoom: 19 }).addTo(backgroundMap);
      backgroundMap.setView([38.88, -6.97], 15);
      setTimeout(() => startDynamicBackground(backgroundMap), 1000);
  }
  
  function setupMenu() {
    const menuTabs = document.querySelectorAll('.menu-tab-btn');
    const contentPanels = document.querySelectorAll('.content-panel');
    openMenuBtn.addEventListener('click', () => {
        menuContentPanel.classList.toggle('hidden');
    });
    menuTabs.forEach(button => {
      button.addEventListener('click', async () => {
        const panelId = button.dataset.panel;
        const targetPanel = document.getElementById(panelId);
        menuTabs.forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        contentPanels.forEach(p => p.classList.remove('active'));
        targetPanel.classList.add('active');
        if (panelId === 'saved-zones-content') await displaySavedZones();
        if (panelId === 'stats-content') await displayStats();
      });
    });
  }

  function initGame() {
    let initialCoords = [38.88, -6.97];
    let initialZoom = 13;
    if (userProfile.cityData) {
        initialCoords = [userProfile.cityData.center_lat, userProfile.cityData.center_lng];
        initialZoom = userProfile.cityData.default_zoom;
    }
    gameMap = L.map('game-map-container', { zoomSnap: 0.25, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(gameMap);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',{
      attribution: '© OSM & CARTO', subdomains:'abcd', maxZoom:19,
      minZoom: userProfile.cityData ? initialZoom - 2 : 5 
    }).addTo(gameMap);
    gameMap.setView(initialCoords, initialZoom);
    if (userProfile.cityData) {
        const latOffset = 20 / 111.1, lngOffset = 20 / (111.1 * Math.cos(initialCoords[0] * Math.PI / 180));
        const bounds = L.latLngBounds(L.latLng(initialCoords[0] - latOffset, initialCoords[1] - lngOffset), L.latLng(initialCoords[0] + latOffset, initialCoords[1] + lngOffset));
        gameMap.setMaxBounds(bounds);
    }
    gameMap.invalidateSize();
    drawZoneBtn.addEventListener('click', startDrawing);
    undoPointBtn.addEventListener('click', undoLastPoint);
    nextBtn.addEventListener('click', () => { nextBtn.disabled=true; nextQ(); });
    repeatZoneBtn.addEventListener('click', repeatLastZone);
    saveZoneBtn.addEventListener('click', saveCurrentZone);
    reportBtnFAB.addEventListener('click', reportIncident);
    adminPanelBtn.addEventListener('click', () => { window.location.href = '/admin.html'; });
    setupStartButton(startBtn);
    setupMenu();
  }

  function setupStartButton(bStart) {
    const firstClickHandler = async () => {
        updatePanelUI(() => {
            startOptions.classList.add('hidden');
        });

        if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
        if (!zonePoly) return;
        if (drawing) {
            drawing = false;
            gameMap.off('click', addVertex);
            tempMarkers.forEach(m => gameMap.removeLayer(m));
            tempMarkers = [];
        }
        bStart.disabled = true;
        await preloadStreets();
        bStart.textContent = 'Iniciar juego';
        bStart.onclick = secondClickHandler;
        
        updatePanelUI(() => {
            checkboxWrapper.classList.add('hidden'); // Ocultar checkbox después de cargar
            if (totalQuestions > 0) {
              bStart.disabled = false;
              startOptions.classList.remove('hidden');
              undoPointBtn.classList.add('hidden');
              startBtn.classList.remove('hidden');
            } else {
              fbEl.textContent = 'No se encontraron calles. Dibuja otra zona.';
              startOptions.classList.add('hidden');
              drawZoneBtn.classList.remove('hidden');
            }
        });
    };
    const secondClickHandler = () => {
        updatePanelUI(() => {
            playing = true; qIdx = 0; streetsGuessedCorrectly = 0;
            scoreDisplay.classList.remove('hidden');
            scoreEl.textContent = `0 / ${totalQuestions}`;
            startOptions.classList.add('hidden');
            nextBtn.classList.remove('hidden');
        });
        gameMap.fitBounds(zonePoly.getBounds(), { padding: [50, 50] });
        nextQ();
    };
    bStart.onclick = firstClickHandler;
  }

  function startDrawing(){
    updatePanelUI(() => {
        fbEl.textContent = 'Haz click para añadir vértices. Con 3 se habilita Start. Haz click en el primer vértice para cerrar.';
        ['repeatZone', 'saveZoneBtn', 'drawZone', 'next', 'loaded-zone-options'].forEach(id => document.getElementById(id).classList.add('hidden'));
        checkboxWrapper.classList.remove('hidden');
        startOptions.classList.remove('hidden');
        undoPointBtn.classList.remove('hidden');
        startBtn.disabled = true;
        startBtn.textContent = 'Start';
        includePOICheckbox.disabled = false;
    });

    if (zonePoly) gameMap.removeLayer(zonePoly);
    if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
    zonePoints = []; tempMarkers = []; zonePoly = null;
    playing = false; drawing = true;
    setupStartButton(startBtn);
    gameMap.on('click', addVertex);
  }

  function addVertex(e){
    const { latlng } = e;
    if(zonePoints.length >= 3 && latlng.equals(zonePoints[0])){ finishPolygon(); return; }
    const mk = L.circleMarker(latlng, { radius:5, color:COL_ZONE }).addTo(gameMap);
    tempMarkers.push(mk);
    zonePoints.push(latlng);
    if(zonePoly) gameMap.removeLayer(zonePoly);
    zonePoly = L.polygon(zonePoints, { color:COL_ZONE, weight:2, fillOpacity:0.1 }).addTo(gameMap);
    if(zonePoints.length >= 3){
        if(startBtn.disabled) { // Solo animar la primera vez que se activa
            updatePanelUI(() => {
                fbEl.textContent = 'Zona mínima definida. Puedes cerrar o añadir más puntos.';
                startBtn.disabled = false; 
            });
        }
    }
  }

  function finishPolygon(){
    updatePanelUI(() => {
        drawing = false;
        gameMap.off('click', addVertex);
        tempMarkers.forEach(m=>gameMap.removeLayer(m));
        tempMarkers = [];
        zonePoly.addLatLng(zonePoints[0]);
        fbEl.textContent = 'Zona cerrada. Pulsa Start para buscar calles.';
        undoPointBtn.classList.add('hidden');
        startBtn.disabled = false;
    });
  }
  
  function undoLastPoint() {
    if (!drawing || zonePoints.length === 0) return;
    updatePanelUI(() => {
        zonePoints.pop();
        const lastMarker = tempMarkers.pop();
        if (lastMarker) gameMap.removeLayer(lastMarker);
        if (zonePoly) gameMap.removeLayer(zonePoly);
        zonePoly = null;
        if (zonePoints.length >= 2) {
            zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
        }
        if (zonePoints.length < 3) {
            startBtn.disabled = true;
        }
        fbEl.textContent = zonePoints.length > 0 ? 'Punto eliminado. Sigue añadiendo.' : 'Haz click para añadir vértices.';
    });
  }

  function repeatLastZone() {
    updatePanelUI(() => {
        if (lastGameZonePoints.length < 3 || lastGameStreetList.length === 0) return;
        clear();
        if (zonePoly) gameMap.removeLayer(zonePoly);
        if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
        questionEl.textContent = '';
        fbEl.textContent = '';
        ['drawZone', 'repeatZone', 'saveZoneBtn', 'start-options', 'loaded-zone-options'].forEach(id => document.getElementById(id).classList.add('hidden'));
        zonePoints = [...lastGameZonePoints];
        zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
        streetList = [...lastGameStreetList].sort(() => Math.random() - 0.5);
        playing = true; qIdx = 0; streetsGuessedCorrectly = 0;
        totalQuestions = streetList.length;
        scoreDisplay.classList.remove('hidden');
        scoreEl.textContent = `0 / ${totalQuestions}`;
        nextBtn.classList.remove('hidden');
    });
    gameMap.fitBounds(zonePoly.getBounds(), { padding: [50, 50] });
    nextQ();
  }

  function onMapClick(e){
    if(!playing) return; 
    gameMap.off('click', onMapClick);
    if (userMk) gameMap.removeLayer(userMk);
    userMk = L.marker(e.latlng).addTo(gameMap);
    streetGrp = drawStreet(); 
    if(streetGrp){
      try {
          streetGrp.eachLayer(layer => {
              const element = layer.getElement();
              if (element) element.classList.add('street-reveal-animation');
          });
      } catch (e) { console.warn("No se pudo aplicar la animación a la calle."); }
      const streetCheck = getDistanceToStreet(userMk.getLatLng(), streetGrp);
      if (streetCheck.distance <= 30) {
        streetsGuessedCorrectly++;
        fbEl.textContent = `¡Correcto! Has acertado.`;
        document.getElementById('correct-sound')?.play().catch(e => console.error("Error sonido acierto:", e));
      } else {
        fbEl.textContent = `Casi, pero no has hecho clic sobre el lugar (a ${Math.round(streetCheck.distance)} metros).`;
        document.getElementById('incorrect-sound')?.play().catch(e => console.error("Error sonido fallo:", e));
      }
      scoreEl.textContent = `${streetsGuessedCorrectly} / ${totalQuestions}`;
      if (streetCheck.point) {
        guide = L.polyline([userMk.getLatLng(), streetCheck.point], { dashArray:'6 4', color:COL_DASH }).addTo(gameMap);
      }
    } else {
      fbEl.textContent = 'Error: No se pudo dibujar el lugar. Pulsa Siguiente.';
    }
    nextBtn.disabled=false;
  }

  function clear(){ 
    if (!gameMap || !playing) return;
    [userMk, guide, streetGrp].forEach(layer => {
        if (layer && gameMap.hasLayer(layer)) gameMap.removeLayer(layer);
    });
    userMk = guide = streetGrp = null; 
  }

  async function preloadStreets() {
      fbEl.textContent = '';
      loaderContainer.classList.remove('hidden');
      const loaderTextElement = document.querySelector('#loader-container .earth p');
      if (loaderTextElement) {
          loaderTextElement.textContent = 'Identificando calles...';
      }
      try {
          const zoneParam = zonePoints.map(p => `${p.lat},${p.lng}`).join(';');
          const includePOI = includePOICheckbox.checked;
          const response = await fetch(`/api/getStreets?zone=${encodeURIComponent(zoneParam)}&includePOI=${includePOI}`);
          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Error del servidor.');
          }
          const data = await response.json();
          streetList = data.streets;
          totalQuestions = streetList.length;
          if (totalQuestions > 0) fbEl.textContent = `Se han encontrado ${totalQuestions} lugares. ¡Listo!`;
          else fbEl.textContent = 'No se han encontrado lugares válidos. Dibuja otra zona.';
          scoreEl.textContent = `0 / ${totalQuestions}`;
      } catch (error) {
          console.error(error);
          fbEl.textContent = `Error al cargar las calles: ${error.message}`;
      } finally {
          loaderContainer.classList.add('hidden');
      }
  }
  
  function drawStreet(){
    const g = L.layerGroup().addTo(gameMap);
    if (!target || !Array.isArray(target) || target.length === 0) return null;
    target.forEach(geom => {
        if (geom.isClosed) L.polygon(geom.points, { color: COL_TRACE, weight: 4, fillOpacity: 0.2 }).addTo(g);
        else L.polyline(geom.points, { color: COL_TRACE, weight: 8 }).addTo(g);
    });
    return g;
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

  function endGame() {
    updatePanelUI(() => {
        playing = false;
        fbEl.textContent = `¡Juego terminado! Has acertado ${streetsGuessedCorrectly} de ${totalQuestions}.`;
        questionEl.textContent = 'Elige una opción o dibuja una nueva zona.';
        scoreDisplay.classList.add('hidden');
        if (zonePoly) {
            zonePoly.setStyle({ color: '#696969', weight: 2, dashArray: '5, 5', fillOpacity: 0.05 });
            oldZonePoly = zonePoly;
        }
        lastGameZonePoints = [...zonePoints];
        lastGameStreetList = [...streetList];
        saveGameStats(streetsGuessedCorrectly, totalQuestions);
        ['next'].forEach(id => document.getElementById(id).classList.add('hidden'));
        ['drawZone', 'repeatZone', 'saveZoneBtn'].forEach(id => document.getElementById(id).classList.remove('hidden'));
        reportBtnFAB.classList.remove('hidden');
        document.getElementById('repeatZone').disabled = (lastGameZonePoints.length < 3 || lastGameStreetList.length === 0);
        zonePoly = null; zonePoints = []; streetList = []; totalQuestions = 0;
        gameMap.off('click', onMapClick);
    });
  }

  function checkAndRecenterMap() {
      if (!gameMap || !zonePoly) return;
      const mapBounds = gameMap.getBounds();
      const polyBounds = zonePoly.getBounds();
      if (!mapBounds.contains(polyBounds)) {
          gameMap.flyToBounds(polyBounds, { padding: [50, 50], duration: 1.2 });
      }
  }

  function nextQ(){
    checkAndRecenterMap();
    clear();
    if(qIdx >= totalQuestions){ endGame(); return; }
    gameMap.on('click', onMapClick);
    const s = streetList[qIdx];
    target = s.geometries;
    qIdx++;
    questionEl.textContent = `Pregunta ${qIdx} / ${totalQuestions}: ¿Dónde está «${s.googleName}»?`;
    fbEl.textContent = 'Haz clic en el mapa para responder.';
    nextBtn.disabled = true;
  }
  
  async function reportIncident() {
    if (lastGameZonePoints.length === 0) {
      alert("Debes jugar en una zona primero para poder reportar una incidencia sobre ella.");
      return;
    }
    const description = prompt("Por favor, describe la incidencia (ej. 'Falta la calle X', 'La calle Y no debería estar', etc.):");
    if (!description || description.trim() === '') return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            alert("Necesitas estar conectado para reportar una incidencia.");
            return;
        }
        const zoneString = lastGameZonePoints.map(p => `${p.lat},${p.lng}`).join(';');
        const requestBody = {
            zone_points: zoneString,
            description: description,
            city: userProfile.subscribedCity
        };
        const response = await fetch('/api/reportIncident', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error del servidor');
        }
        alert("¡Gracias! Tu incidencia ha sido enviada con éxito.");
    } catch (error) {
      console.error('Error al enviar la incidencia:', error.message);
      alert(`Hubo un error al enviar tu reporte: ${error.message}`);
    }
  }
  
  async function saveCurrentZone() {
    const zoneName = prompt("Dale un nombre a esta zona:", "Mi barrio");
    if (!zoneName || zoneName.trim() === '') return;
    if (lastGameZonePoints.length < 3) {
        alert("La zona es demasiado pequeña para guardarla.");
        return;
    }
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        const zoneString = lastGameZonePoints.map(p => `${p.lat},${p.lng}`).join(';');
        const { error } = await supabaseClient.from('saved_zones').insert({ 
            user_id: session.user.id, name: zoneName, zone_points: zoneString 
        });
        if (error) throw error;
        alert(`¡Zona "${zoneName}" guardada con éxito!`);
        saveZoneBtn.classList.add('hidden');
    } catch (error) {
        console.error('Error al guardar la zona:', error.message);
        alert('Hubo un error al guardar la zona.');
    }
  }
  
  async function displaySavedZones() {
    const listContainer = document.getElementById('saved-zones-list');
    listContainer.innerHTML = '<p>Cargando zonas...</p>';
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        const { data: zones, error } = await supabaseClient.from('saved_zones').select('id, name, zone_points').eq('user_id', session.user.id).order('created_at', { ascending: false });
        if (error) throw error;
        listContainer.innerHTML = '';
        if (zones.length === 0) {
            listContainer.innerHTML = '<p>Aún no tienes zonas guardadas.</p>';
            return;
        }
        zones.forEach(zone => {
            const item = document.createElement('div');
            item.className = 'saved-zone-item';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'font-semibold flex-grow truncate';
            nameSpan.textContent = zone.name;
            nameSpan.onclick = () => playFromHistory(zone.zone_points);
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'zone-actions';

            const renameBtn = document.createElement('button');
            renameBtn.className = 'zone-action-btn';
            renameBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>`;
            renameBtn.onclick = (e) => { e.stopPropagation(); renameZone(zone.id, zone.name); };

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'zone-action-btn';
            deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>`;
            deleteBtn.onclick = (e) => { e.stopPropagation(); deleteZone(zone.id); };
            
            actionsDiv.appendChild(renameBtn);
actionsDiv.appendChild(deleteBtn);
            item.appendChild(nameSpan); 
            item.appendChild(actionsDiv);
            listContainer.appendChild(item);
        });
    } catch (error) {
        console.error('Error cargando zonas guardadas:', error.message);
        listContainer.innerHTML = '<p class="text-red-400">Error al cargar zonas.</p>';
    }
  }

  async function renameZone(zoneId, currentName) {
      const newName = prompt("Introduce el nuevo nombre para la zona:", currentName);
      if (!newName || newName.trim() === '' || newName === currentName) {
          return; // No hacer nada si el usuario cancela, no escribe nada o no cambia el nombre
      }
      try {
          const { error } = await supabaseClient
              .from('saved_zones')
              .update({ name: newName.trim() })
              .eq('id', zoneId);
          if (error) throw error;
          await displaySavedZones(); // Refrescar la lista
      } catch (error) {
          console.error('Error al renombrar la zona:', error.message);
          alert('No se pudo renombrar la zona.');
      }
  }

  async function deleteZone(zoneId) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta zona?')) return;
    try {
        const { error } = await supabaseClient.from('saved_zones').delete().eq('id', zoneId);
        if (error) throw error;
        displaySavedZones();
    } catch (error) {
        console.error('Error al eliminar la zona:', error.message);
        alert('No se pudo eliminar la zona.');
    }
  }

  async function saveGameStats(correct, total) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session || total === 0) return;
        await supabaseClient.from('game_stats').insert({ user_id: session.user.id, correct_guesses: correct, total_questions: total });
    } catch (error) {
        console.error('Error guardando estadísticas:', error.message);
    }
  }

  async function displayStats() {
    const statsContent = document.getElementById('stats-list');
    statsContent.innerHTML = '<p>Calculando estadísticas...</p>';
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        const { data: stats, error } = await supabaseClient.from('game_stats').select('correct_guesses, total_questions').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(15);
        if (error) throw error;
        if (stats.length === 0) {
            statsContent.innerHTML = '<p>Juega una partida para ver tus estadísticas.</p>';
            return;
        }
        const totalCorrect = stats.reduce((sum, game) => sum + game.correct_guesses, 0);
        const totalPlayed = stats.reduce((sum, game) => sum + game.total_questions, 0);
        const percentage = totalPlayed > 0 ? Math.round((totalCorrect / totalPlayed) * 100) : 0;
        statsContent.innerHTML = `
            <div class="text-center">
                <p class="text-5xl font-bold text-blue-400">${percentage}%</p>
                <p class="mt-2 text-lg text-gray-300">de aciertos</p>
                <p class="text-sm text-gray-400">(${totalCorrect} de ${totalPlayed} en las últimas partidas)</p>
            </div>`;
    } catch (error) {
        console.error('Error cargando estadísticas:', error.message);
        statsContent.innerHTML = '<p class="text-red-400">Error al cargar estadísticas.</p>';
    }
  }
  
  // --- INICIO: NUEVA FUNCIÓN PARA RESETEAR LA VISTA ---
  function resetToInitialView() {
    updatePanelUI(() => {
        // Ocultar todos los paneles de control dinámicos
        ['start-options', 'loaded-zone-options', 'next', 'repeatZone', 'saveZoneBtn', 'score-display', 'checkbox-wrapper'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.classList.add('hidden');
        });
        
        // Mostrar el botón inicial para empezar a dibujar
        drawZoneBtn.classList.remove('hidden');

        // Limpiar textos de feedback
        questionEl.textContent = '';
        fbEl.textContent = '';

        // Limpiar polígonos del mapa
        if (zonePoly) gameMap.removeLayer(zonePoly);
        if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
        zonePoly = null;
        oldZonePoly = null;
        zonePoints = [];

        // Resetear estado del juego
        playing = false;
    });
  }
  // --- FIN: NUEVA FUNCIÓN ---

  // --- INICIO: FUNCIÓN MODIFICADA PARA CARGAR ZONA GUARDADA ---
  function playFromHistory(zoneString) {
    const points = zoneString.split(';').map(pair => {
      const [lat, lng] = pair.split(',');
      return { lat: parseFloat(lat), lng: parseFloat(lng) };
    });
    if (points.length < 3) return;
    
    updatePanelUI(() => {
        // 1. Limpieza de UI previa
        questionEl.textContent = '';
        scoreDisplay.classList.add('hidden');
        fbEl.textContent = 'Zona cargada. ¿Listo para empezar?';
        ['drawZone', 'start-options', 'next', 'repeatZone', 'saveZoneBtn'].forEach(id => document.getElementById(id).classList.add('hidden'));
        
        // 2. Limpieza de mapa
        if (zonePoly) gameMap.removeLayer(zonePoly);
        if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
        tempMarkers.forEach(m => gameMap.removeLayer(m));
        tempMarkers = [];
        
        // 3. Dibujar la nueva zona
        zonePoints = points.map(p => L.latLng(p.lat, p.lng));
        zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
        
        // 4. Configurar el panel de control
        startLoadedZoneBtn.textContent = 'Start';
        drawNewZoneBtn.textContent = 'Volver';
        
        startLoadedZoneBtn.onclick = async () => {
            updatePanelUI(() => {
                loadedZoneOptions.classList.add('hidden');
                checkboxWrapper.classList.add('hidden');
            });
            await preloadStreets(); // Espera a que las calles se carguen
            if (totalQuestions > 0) {
                // Si se encontraron calles, inicia el juego
                updatePanelUI(() => {
                    playing = true; qIdx = 0; streetsGuessedCorrectly = 0;
                    scoreDisplay.classList.remove('hidden');
                    scoreEl.textContent = `0 / ${totalQuestions}`;
                    nextBtn.classList.remove('hidden');
                });
                gameMap.fitBounds(zonePoly.getBounds(), { padding: [50, 50] });
                nextQ();
            } else {
                // Si no, muestra error y resetea
                fbEl.textContent = 'No se encontraron calles válidas en esta zona.';
                setTimeout(resetToInitialView, 3000);
            }
        };
        
        drawNewZoneBtn.onclick = resetToInitialView;
        
        // 5. Mostrar los controles correctos
        loadedZoneOptions.classList.remove('hidden');
        checkboxWrapper.classList.remove('hidden');
        includePOICheckbox.disabled = false;
    });
    
    menuContentPanel.classList.add('hidden'); // Ocultar el menú lateral
    gameMap.fitBounds(zonePoly.getBounds(), { padding: [50, 50] });
  }
  // --- FIN: FUNCIÓN MODIFICADA ---
  
  googleLoginBtn.addEventListener('click', signInWithGoogle);
  supabaseClient.auth.onAuthStateChange(handleAuthStateChange);
});