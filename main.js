window.addEventListener('DOMContentLoaded', () => {

  const SUPABASE_URL = 'https://hppzwfwtedghpsxfonoh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjQzNDMsImV4cCI6MjA2OTcwMDM0M30.BAh6i5iJ5YkDBoydfkC9azAD4eMdYBkEBdxws9kj5Hg';
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const loginScreen = document.getElementById('login-screen');
  const gameScreen = document.getElementById('game-screen');
  const backgroundMapContainer = document.getElementById('background-map');
  const googleLoginBtn = document.getElementById('google-login-btn');
  
  let backgroundMap, gameMap = null;
  const COL_ZONE = '#663399', COL_TRACE = '#007a2f', COL_DASH = '#1976d2';
  let drawing=false, zonePoly=null, tempMarkers=[], zonePoints=[], oldZonePoly=null;
  let playing=false, qIdx=0, target=null, userMk, guide, streetGrp;
  let streetList = [], totalQuestions = 0, streetsGuessedCorrectly = 0, lastGameZonePoints = [];
  let lastGameStreetList = [];

  let userProfile = { cityData: null, subscribedCity: null, role: null };

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
        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('role, subscribed_city')
            .eq('id', user.id)
            .single();

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
            document.getElementById('admin-panel-btn').classList.remove('hidden');
        }

        if (profile.subscribed_city) {
            const { data: city, error: cityError } = await supabaseClient
                .from('cities')
                .select('*')
                .eq('name', profile.subscribed_city)
                .single();
            
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
      loginScreen.style.opacity = '0';
      gameScreen.classList.remove('hidden');
      
      document.getElementById('user-info-details').innerHTML = `<p class="text-sm text-gray-400">Conectado como</p><p class="font-semibold text-base truncate">${user.email}</p>`;
      document.getElementById('logout-btn').addEventListener('click', signOut);

      setTimeout(async () => {
          loginScreen.classList.add('hidden');
          await fetchUserProfile(user);

          if (!gameMap) {
              initGame();
          } else {
              gameMap.invalidateSize();
          }
      }, 500);

    } else {
      loginScreen.classList.remove('hidden');
      loginScreen.style.opacity = '1';
      gameScreen.classList.add('hidden');
      if (!backgroundMap) {
        initBackgroundMap();
      }
    }
  }

  function startDynamicBackground(bMap) {
      const initialCenter = bMap.getCenter();
      const startTime = Date.now();
      const freqX = 0.00005;
      const freqY = 0.0001;
      const ampX = 0.008;
      const ampY = 0.004;

      setInterval(() => {
          const elapsedTime = Date.now() - startTime;
          const dx = Math.sin(elapsedTime * freqX) * ampX;
          const dy = Math.cos(elapsedTime * freqY) * ampY;

          bMap.panTo([initialCenter.lat + dy, initialCenter.lng + dx], {
              animate: true,
              duration: 1,
              noMoveStart: true
          });
      }, 100);
  }

  function initBackgroundMap() {
      if (backgroundMap) return;
      backgroundMap = L.map('background-map', { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', { attribution: '', maxZoom: 19 }).addTo(backgroundMap);
      backgroundMap.setView([38.88, -6.97], 15);
      setTimeout(() => {
          startDynamicBackground(backgroundMap);
      }, 1000);
  }
  
  function setupMenu() {
    const menuButtons = document.querySelectorAll('.menu-btn');
    const contentPanels = document.querySelectorAll('.content-panel');

    menuButtons.forEach(button => {
      button.addEventListener('click', () => {
        const panelId = button.dataset.panel;
        const targetPanel = document.getElementById(panelId);
        const isAlreadyActive = button.classList.contains('active');
        
        contentPanels.forEach(p => p.classList.remove('active'));
        menuButtons.forEach(b => b.classList.remove('active'));
        
        if (isAlreadyActive) {
          return;
        }

        button.classList.add('active');
        targetPanel.classList.add('active');

        if (panelId === 'saved-zones-content') displaySavedZones();
        if (panelId === 'stats-content') displayStats();
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

    gameMap = L.map('game-map-container', { zoomSnap: 0.25 });
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',{
      attribution: '© OSM & CARTO', subdomains:'abcd', maxZoom:19,
      minZoom: userProfile.cityData ? initialZoom - 2 : 5 
    }).addTo(gameMap);
    
    gameMap.setView(initialCoords, initialZoom);
    
    if (userProfile.cityData) {
        const latOffset = 20 / 111.1;
        const lngOffset = 20 / (111.1 * Math.cos(initialCoords[0] * Math.PI / 180));
        const corner1 = L.latLng(initialCoords[0] - latOffset, initialCoords[1] - lngOffset);
        const corner2 = L.latLng(initialCoords[0] + latOffset, initialCoords[1] + lngOffset);
        const bounds = L.latLngBounds(corner1, corner2);
        gameMap.setMaxBounds(bounds);
    }
    
    gameMap.invalidateSize();

    document.getElementById('drawZone').addEventListener('click', startDrawing);
    document.getElementById('undoPoint').addEventListener('click', undoLastPoint);
    document.getElementById('next').addEventListener('click', () => { document.getElementById('next').disabled=true; nextQ(); });
    document.getElementById('repeatZone').addEventListener('click', repeatLastZone);
    document.getElementById('saveZoneBtn').addEventListener('click', saveCurrentZone);
    document.getElementById('report-btn').addEventListener('click', reportIncident);
    document.getElementById('admin-panel-btn').addEventListener('click', () => { window.location.href = '/admin.html'; });

    setupStartButton(document.getElementById('start'));
    setupMenu();
  }

  function setupStartButton(bStart) {
    const firstClickHandler = async () => {
        if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
        if (!zonePoly) return;
        if (drawing) {
            drawing = false;
            gameMap.off('click', addVertex);
            tempMarkers.forEach(m => gameMap.removeLayer(m));
            tempMarkers = [];
        }
        document.getElementById('undoPoint').classList.add('hidden');
        
        bStart.disabled = true;
        bStart.textContent = 'Cargando calles...';
        document.getElementById('include-poi-checkbox').disabled = true;

        await preloadStreets();
        
        bStart.textContent = 'Iniciar juego';
        bStart.onclick = secondClickHandler;

        if (totalQuestions > 0) {
          bStart.disabled = false;
        } else {
          document.getElementById('fb').textContent = 'No se encontraron calles. Dibuja otra zona.';
          document.getElementById('start-options').classList.add('hidden');
          document.getElementById('drawZone').classList.remove('hidden');
        }
    };
    const secondClickHandler = () => {
        playing = true; qIdx = 0; streetsGuessedCorrectly = 0;
        document.getElementById('score-display').classList.remove('hidden');
        document.getElementById('score').textContent = `0 / ${totalQuestions}`;
        document.getElementById('start-options').classList.add('hidden');
        document.getElementById('next').classList.remove('hidden');
        gameMap.fitBounds(zonePoly.getBounds(), { padding: [50, 50] });
        nextQ();
    };
    bStart.onclick = firstClickHandler;
  }

  function startDrawing(){
    document.getElementById('fb').textContent = 'Haz click para añadir vértices. Con 3 se habilita Start. Haz click en el primer vértice para cerrar.';
    ['repeatZone', 'saveZoneBtn', 'drawZone'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['undoPoint', 'start-options'].forEach(id => document.getElementById(id).classList.remove('hidden'));
    
    const startButton = document.getElementById('start');
    startButton.disabled = true;
    startButton.textContent = 'Start';
    document.getElementById('include-poi-checkbox').disabled = false;

    if (zonePoly) gameMap.removeLayer(zonePoly);
    if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
    zonePoints = []; tempMarkers = []; zonePoly = null;
    playing = false;
    drawing = true;
    
    setupStartButton(startButton);
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
      document.getElementById('fb').textContent = 'Zona mínima definida. Puedes cerrar o añadir más puntos.';
      document.getElementById('start').disabled = false; 
    }
  }

  function finishPolygon(){
    drawing = false;
    gameMap.off('click', addVertex);
    tempMarkers.forEach(m=>gameMap.removeLayer(m));
    tempMarkers = [];
    zonePoly.addLatLng(zonePoints[0]);
    document.getElementById('fb').textContent = 'Zona cerrada. Pulsa Start para buscar calles.';
    document.getElementById('undoPoint').classList.add('hidden');
    document.getElementById('start').disabled = false;
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
    document.getElementById('start').disabled = zonePoints.length < 3;
    document.getElementById('fb').textContent = zonePoints.length > 0 ? 'Punto eliminado. Sigue añadiendo.' : 'Haz click para añadir vértices.';
  }

  function repeatLastZone() {
    if (lastGameZonePoints.length < 3 || lastGameStreetList.length === 0) return;

    clear();
    if (zonePoly) gameMap.removeLayer(zonePoly);
    if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
    document.getElementById('question').textContent = '';
    document.getElementById('fb').textContent = '';
    ['drawZone', 'repeatZone', 'saveZoneBtn', 'start-options'].forEach(id => document.getElementById(id).classList.add('hidden'));

    zonePoints = [...lastGameZonePoints];
    zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
    streetList = [...lastGameStreetList];
    streetList.sort(() => Math.random() - 0.5); 

    playing = true;
    qIdx = 0;
    streetsGuessedCorrectly = 0;
    totalQuestions = streetList.length;

    document.getElementById('score-display').classList.remove('hidden');
    document.getElementById('score').textContent = `0 / ${totalQuestions}`;
    document.getElementById('next').classList.remove('hidden');
    
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
              if (element) {
                  element.classList.add('street-reveal-animation');
              }
          });
      } catch (e) {
          console.warn("No se pudo aplicar la animación a la calle.");
      }

      const streetCheck = getDistanceToStreet(userMk.getLatLng(), streetGrp);
      if (streetCheck.distance <= 30) {
        streetsGuessedCorrectly++;
        document.getElementById('fb').textContent = `¡Correcto! Has acertado.`;
        const correctSound = document.getElementById('correct-sound');
        if (correctSound) {
            correctSound.play().catch(error => console.error("Error al reproducir sonido de acierto:", error));
        }
      } else {
        document.getElementById('fb').textContent = `Casi, pero no has hecho clic sobre el lugar (a ${Math.round(streetCheck.distance)} metros).`;
        const incorrectSound = document.getElementById('incorrect-sound');
        if (incorrectSound) {
            incorrectSound.play().catch(error => console.error("Error al reproducir sonido de fallo:", error));
        }
      }
      document.getElementById('score').textContent = `${streetsGuessedCorrectly} / ${totalQuestions}`;
      if (streetCheck.point) {
        guide = L.polyline([userMk.getLatLng(), streetCheck.point], { dashArray:'6 4', color:COL_DASH }).addTo(gameMap);
      }
    } else {
      document.getElementById('fb').textContent = 'Error: No se pudo dibujar el lugar. Pulsa Siguiente.';
    }
    document.getElementById('next').disabled=false;
  }

  function clear(){ 
    if (!gameMap || !playing) return;
    [userMk, guide, streetGrp].forEach(layer => {
        if (layer && gameMap.hasLayer(layer)) gameMap.removeLayer(layer);
    });
    userMk = guide = streetGrp = null; 
  }

  async function preloadStreets() {
      const fb = document.getElementById('fb');
      const loaderContainer = document.getElementById('loader-container');
      const loadingText = document.getElementById('loading-text');
      
      fb.textContent = '';
      loaderContainer.classList.remove('hidden');
      loadingText.innerHTML = `Identificando calles...`;

      try {
          const zoneParam = zonePoints.map(p => `${p.lat},${p.lng}`).join(';');
          const includePOI = document.getElementById('include-poi-checkbox').checked;
          const response = await fetch(`/api/getStreets?zone=${encodeURIComponent(zoneParam)}&includePOI=${includePOI}`);
          
          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Error del servidor.');
          }
          const data = await response.json();
          streetList = data.streets;
          totalQuestions = streetList.length;

          if (totalQuestions > 0) fb.textContent = `Se han encontrado ${totalQuestions} lugares. ¡Listo!`;
          else fb.textContent = 'No se han encontrado lugares válidos. Dibuja otra zona.';
          document.getElementById('score').textContent = `0 / ${totalQuestions}`;
      } catch (error) {
          console.error(error);
          fb.textContent = `Error al cargar las calles: ${error.message}`;
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
    playing = false;
    document.getElementById('fb').textContent = `¡Juego terminado! Has acertado ${streetsGuessedCorrectly} de ${totalQuestions}.`;
    document.getElementById('question').textContent = 'Elige una opción o dibuja una nueva zona.';
    document.getElementById('score-display').classList.add('hidden');
    if (zonePoly) {
        zonePoly.setStyle({ color: '#696969', weight: 2, dashArray: '5, 5', fillOpacity: 0.05 });
        oldZonePoly = zonePoly;
    }
    lastGameZonePoints = [...zonePoints];
    lastGameStreetList = [...streetList];
    saveGameStats(streetsGuessedCorrectly, totalQuestions);
    
    ['next'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['drawZone', 'repeatZone', 'saveZoneBtn'].forEach(id => document.getElementById(id).classList.remove('hidden'));
    
    document.getElementById('repeatZone').disabled = (lastGameZonePoints.length < 3 || lastGameStreetList.length === 0);

    zonePoly = null; 
    zonePoints = []; 
    streetList = []; 
    totalQuestions = 0;
    gameMap.off('click', onMapClick);
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
    document.getElementById('question').textContent = `Pregunta ${qIdx} / ${totalQuestions}: ¿Dónde está «${s.googleName}»?`;
    document.getElementById('fb').textContent = 'Haz clic en el mapa para responder.';
    document.getElementById('next').disabled = true;
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
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
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
  
  // --- FUNCIÓN MODIFICADA PARA ARREGLAR EL BUG DE GUARDADO ---
  async function saveCurrentZone() {
    const zoneName = prompt("Dale un nombre a esta zona:", "Mi barrio");
    if (!zoneName || zoneName.trim() === '') return;
    
    // CORRECCIÓN: Usar lastGameZonePoints en lugar de zonePoints, que se vacía al final del juego.
    if (lastGameZonePoints.length < 3) {
        alert("La zona es demasiado pequeña para guardarla.");
        return;
    }
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        // CORRECCIÓN: Usar lastGameZonePoints para crear el string de la zona.
        const zoneString = lastGameZonePoints.map(p => `${p.lat},${p.lng}`).join(';');
        const { error } = await supabaseClient.from('saved_zones').insert({ 
            user_id: session.user.id, 
            name: zoneName, 
            zone_points: zoneString 
        });
        
        if (error) throw error;
        alert(`¡Zona "${zoneName}" guardada con éxito!`);
        document.getElementById('saveZoneBtn').classList.add('hidden'); // Opcional: Ocultar tras guardar
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
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-zone-btn';
            deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><rect width="256" height="256" fill="none"></rect><line x1="216" y1="56" x2="40" y2="56" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"></line><line x1="104" y1="104" x2="104" y2="168" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"></line><line x1="152" y1="104" x2="152" y2="168" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"></line><path d="M200,56V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V56" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"></path><path d="M168,56V40a16,16,0,0,0-16-16H104A16,16,0,0,0,88,40V56" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"></path></svg>`;
            deleteBtn.onclick = (e) => {
              e.stopPropagation();
              deleteZone(zone.id);
            };

            item.appendChild(nameSpan);
            item.appendChild(deleteBtn);
            listContainer.appendChild(item);
        });
    } catch (error) {
        console.error('Error cargando zonas guardadas:', error.message);
        listContainer.innerHTML = '<p class="text-red-400">Error al cargar zonas.</p>';
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
  
  function playFromHistory(zoneString) {
    const points = zoneString.split(';').map(pair => {
      const [lat, lng] = pair.split(',');
      return { lat: parseFloat(lat), lng: parseFloat(lng) };
    });
    if (points.length < 3) return;
    startDrawing(); 
    drawing = false; 
    gameMap.off('click', addVertex);
    zonePoints = points.map(p => L.latLng(p.lat, p.lng));
    zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
    document.getElementById('undoPoint').classList.add('hidden');
    document.getElementById('start-options').classList.remove('hidden');
    document.getElementById('start').disabled = false;
    document.getElementById('fb').textContent = 'Zona cargada. Pulsa Start.';
    gameMap.fitBounds(zonePoly.getBounds(), { padding: [50, 50] });
  }
  
  googleLoginBtn.addEventListener('click', signInWithGoogle);
  supabaseClient.auth.onAuthStateChange(handleAuthStateChange);
});