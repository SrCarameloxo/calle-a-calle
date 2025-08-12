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
  const drawHelpContainer = document.getElementById('draw-help-container');
  const dismissDrawHelpBtn = document.getElementById('dismiss-draw-help');

  const gameInterface = document.getElementById('game-interface');
  const gameQuestion = document.getElementById('game-question');
  const scoreDisplayToggle = document.getElementById('score-display-toggle');
  const progressComponent = document.getElementById('progress-component');
  const progressBar = document.getElementById('progress-bar');
  const progressCounter = document.getElementById('progress-counter');
  const streakDisplay = document.getElementById('streak-display');
  
  const endGameOptions = document.getElementById('end-game-options');
  const finalScoreEl = document.getElementById('final-score');
  const reviewGameBtn = document.getElementById('review-game-btn');
  const repeatZoneBtn = document.getElementById('repeatZone');
  const saveZoneBtn = document.getElementById('saveZoneBtn');
  const backToMenuBtn = document.getElementById('back-to-menu-btn');
  const backFromReviewBtn = document.getElementById('back-from-review-btn');

  let backgroundMap, gameMap = null;
  const COL_ZONE = '#663399', COL_TRACE = '#007a2f', COL_DASH = '#1976d2';
  let drawing=false, zonePoly=null, tempMarkers=[], zonePoints=[], oldZonePoly=null, reviewLayer=null;
  let playing=false, qIdx=0, target=null, userMk, guide, streetGrp;
  let streetList = [], totalQuestions = 0, streetsGuessedCorrectly = 0, lastGameZonePoints = [];
  let lastGameStreetList = [];
  let userProfile = { id: null, cityData: null, subscribedCity: null, role: null, showDrawHelp: true };
  let currentStreak = 0;
  let showScoreAsPercentage = false;

  // --- INICIO: CÓDIGO AÑADIDO (BLOQUE 1 de 2) ---
  // --- Gestión de Modos de Juego ---
  
  let currentGameMode = 'classic'; // Modo por defecto al iniciar

  // Diccionario con los SVG de los iconos para cada modo
  const modeIcons = {
    classic: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>`,
    revancha: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.181-3.183m-4.991-2.695v-4.992m0 0h-4.992m4.992 0l-3.181-3.183a8.25 8.25 0 00-11.664 0l-3.181 3.183" /></svg>`,
    instinto: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.553L16.5 21.75l-.398-1.197a3.375 3.375 0 00-2.986-2.986L12 17.25l1.197-.398a3.375 3.375 0 002.986-2.986L16.5 12.75l.398 1.197a3.375 3.375 0 002.986 2.986L21 17.25l-1.197.398a3.375 3.375 0 00-2.986 2.986z" /></svg>`
  };

  // Función central para cambiar el modo de juego
  function setGameMode(mode) {
    if (!mode || !modeIcons[mode]) {
        console.error("Modo de juego no válido:", mode);
        return;
    }
    currentGameMode = mode;
    console.log(`Modo de juego cambiado a: ${currentGameMode}`);
    
    const indicator = document.getElementById('mode-indicator');
    indicator.innerHTML = modeIcons[mode];
    indicator.classList.remove('hidden');

    // Prepara la UI para el modo seleccionado
    if (mode === 'classic') {
        // En modo clásico, el flujo normal es empezar con el botón de dibujar zona
        resetToInitialView();
    } else if (mode === 'revancha') {
        // En modo revancha, no se dibuja zona, se empieza directamente
        // Ocultamos todos los botones de inicio y mostramos el loader
        resetToInitialView(); // Limpiamos la UI
        drawZoneBtn.classList.add('hidden'); // Ocultamos el botón de dibujar zona
        alert("Modo Revancha seleccionado. En el siguiente paso, esto iniciará el juego directamente.");
        // Aquí, en el futuro, llamaremos a la función que inicie la partida de revancha.
    }
  }
  // --- FIN: CÓDIGO AÑADIDO (BLOQUE 1 de 2) ---

  function updatePanelUI(updateFunction) {
      const heightBefore = gameUiContainer.offsetHeight;
      updateFunction();
      const heightAfter = gameUiContainer.offsetHeight;
      if (heightBefore !== heightAfter) {
          gameUiContainer.classList.add('panel-pulse');
          setTimeout(() => gameUiContainer.classList.remove('panel-pulse'), 400);
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
        const { data: profile, error } = await supabaseClient.from('profiles').select('role, subscribed_city, mostrar_ayuda_dibujo').eq('id', user.id).single();
        if (error) { throw error; }
        userProfile.id = user.id;
        userProfile.role = profile.role;
        userProfile.subscribedCity = profile.subscribed_city;
        userProfile.showDrawHelp = profile.mostrar_ayuda_dibujo;
        
        if (profile.role === 'admin') adminPanelBtn.classList.remove('hidden');
        if (profile.subscribed_city) {
            const { data: city, error: cityError } = await supabaseClient.from('cities').select('*').eq('name', profile.subscribed_city).single();
            if (cityError) throw new Error(`No se encontraron datos para la ciudad: ${profile.subscribed_city}`);
            userProfile.cityData = city;
        }
    } catch (e) {
        console.error("Error al obtener el perfil del usuario:", e);
        alert("Hubo un problema al cargar los datos de tu perfil.");
    }
  }

  async function handleAuthStateChange(event, session) {
    const user = session ? session.user : null;
    if (user) {
      const userName = user.user_metadata?.full_name || user.email.split('@')[0];
      const profileImageUrl = user.user_metadata?.avatar_url || '';
      userInfoDetails.innerHTML = `<img src="${profileImageUrl}" alt="Avatar" class="w-16 h-16 mx-auto mb-3 rounded-full"><p class="font-semibold text-lg truncate">${userName}</p><p class="text-sm text-gray-400">${user.email}</p>`;
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
    const handleOutsideClick = (event) => {
        if (!menuContentPanel.classList.contains('hidden') && !menuContentPanel.contains(event.target) && !openMenuBtn.contains(event.target)) {
            menuContentPanel.classList.add('hidden');
            document.removeEventListener('click', handleOutsideClick);
        }
    };
    openMenuBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isHidden = menuContentPanel.classList.toggle('hidden');
        if (!isHidden) {
            document.addEventListener('click', handleOutsideClick);
        } else {
            document.removeEventListener('click', handleOutsideClick);
        }
    });

    document.querySelectorAll('.menu-tab-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const panelId = button.dataset.panel;
        document.querySelectorAll('.menu-tab-btn').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(panelId).classList.add('active');
        if (panelId === 'saved-zones-content') await displaySavedZones();
        if (panelId === 'stats-content') await displayStats();
      });
    });

    // --- INICIO: CÓDIGO AÑADIDO (BLOQUE 2 de 2) ---
    // --- Lógica para los botones de selección de modo ---
    document.querySelectorAll('.mode-select-btn').forEach(button => {
        button.addEventListener('click', () => {
            const selectedMode = button.dataset.mode;
            if (button.disabled) return;

            setGameMode(selectedMode);
            menuContentPanel.classList.add('hidden'); // Cerramos el menú al seleccionar
        });
    });
    // --- FIN: CÓDIGO AÑADIDO (BLOQUE 2 de 2) ---
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
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',{ attribution: '© OSM & CARTO', subdomains:'abcd', maxZoom:19, minZoom: userProfile.cityData ? initialZoom - 2 : 5 }).addTo(gameMap);
    gameMap.setView(initialCoords, initialZoom);
    if (userProfile.cityData) {
        const latOffset = 20 / 111.1, lngOffset = 20 / (111.1 * Math.cos(initialCoords[0] * Math.PI / 180));
        gameMap.setMaxBounds(L.latLngBounds(L.latLng(initialCoords[0] - latOffset, initialCoords[1] - lngOffset), L.latLng(initialCoords[0] + latOffset, initialCoords[1] + lngOffset)));
    }
    gameMap.invalidateSize();
    
    // Mostramos el icono del modo por defecto (clásico) al iniciar
    setGameMode('classic');

    drawZoneBtn.addEventListener('click', startDrawing);
    undoPointBtn.addEventListener('click', undoLastPoint);
    nextBtn.addEventListener('click', () => { nextBtn.disabled=true; nextQ(); });
    reportBtnFAB.addEventListener('click', reportIncident);
    adminPanelBtn.addEventListener('click', () => { window.location.href = '/admin.html'; });
    dismissDrawHelpBtn.addEventListener('click', dismissDrawHelp);
    scoreDisplayToggle.addEventListener('click', toggleScoreDisplay);

    reviewGameBtn.addEventListener('click', enterReviewMode);
    repeatZoneBtn.addEventListener('click', repeatLastZone);
    saveZoneBtn.addEventListener('click', saveCurrentZone);
    backToMenuBtn.addEventListener('click', resetToInitialView);
    backFromReviewBtn.addEventListener('click', exitReviewMode);

    setupStartButton(startBtn);
    setupMenu();

    // --- LÓGICA AÑADIDA PARA LA BARRA ESPACIADORA ---
    document.addEventListener('keyup', (event) => {
        if (event.code === 'Space' && !nextBtn.disabled) {
            event.preventDefault(); // Evita que la página haga scroll
            nextBtn.click();
        }
    });
  }

  async function dismissDrawHelp() {
      drawHelpContainer.classList.add('hidden');
      if (userProfile.id) {
          userProfile.showDrawHelp = false;
          const { error } = await supabaseClient.from('profiles').update({ mostrar_ayuda_dibujo: false }).eq('id', userProfile.id);
          if(error) console.error("Error al guardar preferencia de ayuda:", error);
      }
  }

  function toggleScoreDisplay(){
      showScoreAsPercentage = !showScoreAsPercentage;
      updateScoreDisplay();
  }

  function updateScoreDisplay(feedbackText, feedbackColor) {
      if (feedbackText) {
          scoreDisplayToggle.textContent = feedbackText;
          if (feedbackColor) scoreDisplayToggle.style.color = feedbackColor;
          setTimeout(() => { updateScoreDisplay(); }, 3000);
      } else {
          scoreDisplayToggle.style.color = '#555';
          const answeredQuestions = qIdx;
          if(showScoreAsPercentage){
              const percentage = answeredQuestions > 0 ? Math.round((streetsGuessedCorrectly / answeredQuestions) * 100) : 0;
              scoreDisplayToggle.textContent = `Aciertos: ${percentage}%`;
          } else {
              scoreDisplayToggle.textContent = `Calles acertadas: ${streetsGuessedCorrectly} / ${answeredQuestions}`;
          }
      }
  }

  function startGameFlow() {
      playing = true; qIdx = 0; streetsGuessedCorrectly = 0; currentStreak = 0;
      updatePanelUI(() => {
          gameInterface.classList.remove('hidden');
          progressBar.style.width = '0%';
      });
      reportBtnFAB.classList.remove('hidden');
      recenterMapWithPadding();
      nextQ();
  }

  function setupStartButton(bStart) {
    const firstClickHandler = async () => {
        updatePanelUI(() => startOptions.classList.add('hidden'));
        if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
        if (!zonePoly) return;
        if (drawing) {
            drawing = false;
            gameMap.off('click', addVertex);
            tempMarkers.forEach(m => gameMap.removeLayer(m));
            tempMarkers = [];
            drawHelpContainer.classList.add('hidden');
        }
        bStart.disabled = true;
        await preloadStreets();
        bStart.textContent = 'Iniciar juego';
        bStart.onclick = secondClickHandler;
        updatePanelUI(() => {
            checkboxWrapper.classList.add('hidden'); 
            if (totalQuestions > 0) {
              bStart.disabled = false;
              startOptions.classList.remove('hidden');
              undoPointBtn.classList.add('hidden');
              startBtn.classList.remove('hidden');
            } else {
              alert('No se encontraron calles válidas en esta zona. Por favor, dibuja otra.');
              resetToInitialView();
            }
        });
    };
    const secondClickHandler = () => {
        updatePanelUI(() => startOptions.classList.add('hidden'));
        startGameFlow();
    };
    bStart.onclick = firstClickHandler;
  }

  function startDrawing(){
    updatePanelUI(() => {
        ['end-game-options', 'drawZone', 'loaded-zone-options', 'game-interface', 'back-from-review-btn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        if (userProfile.showDrawHelp) drawHelpContainer.classList.remove('hidden');
        checkboxWrapper.classList.remove('hidden');
        startOptions.classList.remove('hidden');
        undoPointBtn.classList.remove('hidden');
        startBtn.disabled = true;
        startBtn.textContent = 'Start';
        includePOICheckbox.disabled = false;
    });
    clear(true);
    if (zonePoly) gameMap.removeLayer(zonePoly);
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
    if(zonePoints.length >= 3 && startBtn.disabled) {
        updatePanelUI(() => { startBtn.disabled = false; });
    }
  }

  function finishPolygon(){
    updatePanelUI(() => {
        drawing = false;
        gameMap.off('click', addVertex);
        tempMarkers.forEach(m=>gameMap.removeLayer(m));
        tempMarkers = [];
        zonePoly.addLatLng(zonePoints[0]);
        undoPointBtn.classList.add('hidden');
        startBtn.disabled = false;
        drawHelpContainer.classList.add('hidden');
    });
  }
  
  function undoLastPoint() {
    if (!drawing || zonePoints.length === 0) return;
    updatePanelUI(() => {
        zonePoints.pop();
        const lastMarker = tempMarkers.pop();
        if (lastMarker) gameMap.removeLayer(lastMarker);
        if (zonePoly) gameMap.removeLayer(zonePoly);
        zonePoly = (zonePoints.length >= 2) ? L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap) : null;
        if (zonePoints.length < 3) startBtn.disabled = true;
    });
  }

  function onMapClick(e){
    if(!playing) return; 
    gameMap.off('click', onMapClick);
    if (userMk) gameMap.removeLayer(userMk);
    userMk = L.marker(e.latlng).addTo(gameMap);
    streetGrp = drawStreet(); 
    if(streetGrp){
      streetGrp.eachLayer(layer => {
          const element = layer.getElement();
          if (element) element.classList.add('street-reveal-animation');
      });
      const streetCheck = getDistanceToStreet(userMk.getLatLng(), streetGrp);
      
      let feedbackClass = '';

      if (streetCheck.distance <= 30) {
        streetsGuessedCorrectly++;
        currentStreak++;
        updateScoreDisplay('¡Correcto!', '#28a745');
        document.getElementById('correct-sound')?.play().catch(e => {});
        feedbackClass = 'panel-pulse-correct';
        if (currentStreak >= 3) {
            streakDisplay.textContent = `¡Racha de ${currentStreak}!`;
            streakDisplay.classList.add('visible');
        }

      } else {
        // Si el modo es clásico, guardamos el fallo. En otros modos podríamos no querer hacerlo.
        if (currentGameMode === 'classic' && target && streetList[qIdx - 1]) {
            const failedStreetData = {
                googleName: streetList[qIdx - 1].googleName,
                geometries: streetList[qIdx - 1].geometries,
                city: userProfile.subscribedCity
            };
            saveFailedStreet(failedStreetData);
        }
        
        currentStreak = 0;
        streakDisplay.classList.remove('visible');
        updateScoreDisplay(`Casi... a ${Math.round(streetCheck.distance)} metros.`, '#c82333');
        document.getElementById('incorrect-sound')?.play().catch(e => {});
        feedbackClass = 'panel-pulse-incorrect';
      }
      
      gameUiContainer.classList.add(feedbackClass);
      gameUiContainer.addEventListener('animationend', () => {
          gameUiContainer.classList.remove(feedbackClass);
      }, { once: true });

      const progress = totalQuestions > 0 ? ((qIdx) / totalQuestions) * 100 : 0;
      progressBar.style.width = `${progress}%`;
      
      if (streetCheck.point) guide = L.polyline([userMk.getLatLng(), streetCheck.point], { dashArray:'6 4', color:COL_DASH }).addTo(gameMap);
    } else {
      updateScoreDisplay('Error: No se pudo dibujar el lugar.', '#c82333');
    }

    nextBtn.disabled=false;
  }

  function clear(clearFull=false){ 
    [userMk, guide, streetGrp].forEach(layer => {
        if (layer && gameMap.hasLayer(layer)) gameMap.removeLayer(layer);
    });
    userMk = guide = streetGrp = null;
    if(clearFull){
        if(reviewLayer) gameMap.removeLayer(reviewLayer);
        if(oldZonePoly) gameMap.removeLayer(oldZonePoly);
        reviewLayer = oldZonePoly = null;
    }
  }

  async function preloadStreets() {
      loaderContainer.classList.remove('hidden');
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
          totalQuestions = data.streets.length;
      } catch (error) {
          console.error(error);
          alert(`Error al cargar las calles: ${error.message}`);
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
          if(latlngs.length < 2) return;
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
        gameInterface.classList.add('hidden');
        finalScoreEl.textContent = `¡Partida terminada! Puntuación: ${streetsGuessedCorrectly} / ${totalQuestions}`;
        endGameOptions.classList.remove('hidden');
        backToMenuBtn.classList.remove('hidden');
        
        if (zonePoly) {
            zonePoly.setStyle({ color: '#696969', weight: 2, dashArray: '5, 5', fillOpacity: 0.05 });
            oldZonePoly = zonePoly;
        }
        lastGameZonePoints = [...zonePoints];
        lastGameStreetList = [...streetList];
        saveGameStats(streetsGuessedCorrectly, totalQuestions);
        
        repeatZoneBtn.disabled = (lastGameZonePoints.length < 3 || lastGameStreetList.length === 0);
        zonePoly = null; zonePoints = [];
        gameMap.off('click', onMapClick);
    });
  }

  function enterReviewMode() {
      if(reviewLayer) gameMap.removeLayer(reviewLayer);
      const bounds = L.latLngBounds();
      const reviewColors = [ '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff'];
      reviewLayer = L.layerGroup().addTo(gameMap);
      const etiquetasYaPuestas = new Set();

      lastGameStreetList.forEach((street, index) => {
          const color = reviewColors[index % reviewColors.length];
          let etiquetaPuesta = etiquetasYaPuestas.has(street.googleName);

          street.geometries.forEach(geom => {
              const layer = geom.isClosed 
                  ? L.polygon(geom.points, { color, weight: 4, fillOpacity: 0.3 })
                  : L.polyline(geom.points, { color, weight: 8 });
              
              if (!etiquetaPuesta) {
                  const tooltipClass = `street-tooltip street-tooltip-color-${index % reviewColors.length}`;
                  layer.bindTooltip(street.googleName, { permanent: true, direction: 'center', className: tooltipClass }).openTooltip();
                  etiquetasYaPuestas.add(street.googleName);
                  etiquetaPuesta = true;
              }
              
              layer.addTo(reviewLayer);
              bounds.extend(layer.getBounds());
          });
      });

      if (bounds.isValid()) {
          recenterMapWithPadding(bounds);
      }
      
      updatePanelUI(() => {
          endGameOptions.classList.add('hidden');
          backFromReviewBtn.classList.remove('hidden');
      });
  }

  function exitReviewMode() {
      if(reviewLayer) gameMap.removeLayer(reviewLayer);
      reviewLayer = null;
      if (oldZonePoly && !gameMap.hasLayer(oldZonePoly)) {
          oldZonePoly.addTo(gameMap);
      }
      if (oldZonePoly) recenterMapWithPadding(oldZonePoly.getBounds());

      updatePanelUI(() => {
          backFromReviewBtn.classList.add('hidden');
          endGameOptions.classList.remove('hidden');
      });
  }
  
  function recenterMapWithPadding(bounds = null) {
      if (!gameMap) return;
      const targetBounds = bounds || (zonePoly ? zonePoly.getBounds() : null);
      if (!targetBounds || !targetBounds.isValid()) return;

      const panelWidth = gameUiContainer.offsetWidth;
      gameMap.fitBounds(targetBounds, {
          paddingTopLeft: [panelWidth + 20, 20],
          paddingBottomRight: [20, 20]
      });
  }

  function nextQ(){
    recenterMapWithPadding();
    clear();
    if(qIdx >= totalQuestions){
        setTimeout(endGame, 500);
        return; 
    }
    
    gameMap.on('click', onMapClick);
    const s = streetList[qIdx];
    target = s.geometries;
    
    updatePanelUI(() => {
        gameQuestion.textContent = `¿Dónde está «${s.googleName}»?`;
        updateScoreDisplay();
        if (currentStreak < 3) streakDisplay.classList.remove('visible');
        progressCounter.textContent = `${qIdx + 1} / ${totalQuestions}`;
    });

    qIdx++;
    nextBtn.disabled = true;
  }
  
  function resetToInitialView() {
    clear(true);
    updatePanelUI(() => {
        ['start-options', 'loaded-zone-options', 'checkbox-wrapper', 'game-interface', 'end-game-options', 'back-from-review-btn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('hidden');
            }
        });
        reportBtnFAB.classList.add('hidden');
        drawZoneBtn.classList.remove('hidden');
        if (zonePoly) gameMap.removeLayer(zonePoly);
        if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
        zonePoly = oldZonePoly = null;
        zonePoints = [];
        playing = false;
        progressBar.style.width = '0%';
    });
  }

  function playFromHistory(zoneString) {
    gameMap.off('click', addVertex);
    const points = zoneString.split(';').map(pair => {
      const [lat, lng] = pair.split(',');
      return { lat: parseFloat(lat), lng: parseFloat(lng) };
    });
    if (points.length < 3) return;
    
    updatePanelUI(() => {
        ['drawZone', 'start-options', 'game-interface', 'end-game-options'].forEach(id => document.getElementById(id).classList.add('hidden'));
        clear(true);
        if (zonePoly) gameMap.removeLayer(zonePoly);
        tempMarkers.forEach(m => gameMap.removeLayer(m));
        tempMarkers = [];
        zonePoints = points.map(p => L.latLng(p.lat, p.lng));
        zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
        
        startLoadedZoneBtn.onclick = async () => {
            updatePanelUI(() => {
                loadedZoneOptions.classList.add('hidden');
                checkboxWrapper.classList.add('hidden');
            });
            await preloadStreets(); 
            if (totalQuestions > 0) {
                startGameFlow();
            } else {
                alert('No se encontraron calles válidas en esta zona.');
                resetToInitialView();
            }
        };
        drawNewZoneBtn.onclick = resetToInitialView;
        loadedZoneOptions.classList.remove('hidden');
        checkboxWrapper.classList.remove('hidden');
        includePOICheckbox.disabled = false;
    });
    
    menuContentPanel.classList.add('hidden'); 
    recenterMapWithPadding(zonePoly.getBounds());
  }

  function repeatLastZone() {
      if (lastGameZonePoints.length < 3 || lastGameStreetList.length === 0) return;
      clear(true);
      if (zonePoly) gameMap.removeLayer(zonePoly);
      
      updatePanelUI(() => {
          ['drawZone', 'end-game-options', 'start-options', 'loaded-zone-options', 'back-to-menu-btn', 'back-from-review-btn'].forEach(id => document.getElementById(id).classList.add('hidden'));
      });
      
      zonePoints = [...lastGameZonePoints];
      zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
      streetList = [...lastGameStreetList].sort(() => Math.random() - 0.5);
      totalQuestions = streetList.length;
      
      startGameFlow();
  }

  async function reportIncident() {
    const pointsToReport = playing ? zonePoints : lastGameZonePoints;
    
    if (pointsToReport.length === 0) {
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
        const zoneString = pointsToReport.map(p => `${p.lat},${p.lng}`).join(';');
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

// --- INICIO: CÓDIGO AÑADIDO PARA GUARDAR FALLOS ---
async function saveFailedStreet(streetData) {
    // Esta función se encarga de enviar los datos de una calle fallada al backend
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            // No hacemos nada si el usuario no está logueado
            return;
        }

        const requestBody = {
            osm_name: streetData.googleName, // Usamos el nombre limpio como identificador
            city: streetData.city,
            geometries: streetData.geometries
        };

        // Llamamos a la nueva API que hemos creado. Es una operación de "disparar y olvidar",
        // no necesitamos esperar una respuesta detallada, solo que no falle.
        const response = await fetch('/api/saveFailure', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(requestBody)
        });
        
        // Opcional: puedes registrar si la operación fue exitosa o no
        if (!response.ok) {
           console.error('La API de guardado de fallos devolvió un error.', await response.json());
        } else {
           console.log(`Fallo en "${streetData.googleName}" registrado para el modo revancha.`);
        }

    } catch (error) {
        // En caso de un error de red o similar, lo mostramos en la consola
        // para no interrumpir el juego del usuario.
        console.error('Error al intentar guardar la calle fallada:', error.message);
    }
}
// --- FIN: CÓDIGO AÑADIDO ---
  
  async function saveCurrentZone() {
    if (lastGameZonePoints.length < 3) {
        alert("La zona es demasiado pequeña para guardarla.");
        return;
    }
    const zoneName = prompt("Dale un nombre a esta zona:", "Mi barrio");
    if (!zoneName || zoneName.trim() === '') return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        const zoneString = lastGameZonePoints.map(p => `${p.lat},${p.lng}`).join(';');
        const { error } = await supabaseClient.from('saved_zones').insert({ user_id: session.user.id, name: zoneName, zone_points: zoneString });
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
        listContainer.innerHTML = zones.length === 0 ? '<p>Aún no tienes zonas guardadas.</p>' : '';
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
            actionsDiv.append(renameBtn, deleteBtn);
            item.append(nameSpan, actionsDiv);
            listContainer.appendChild(item);
        });
    } catch (error) {
        console.error('Error cargando zonas guardadas:', error.message);
        listContainer.innerHTML = '<p class="text-red-400">Error al cargar zonas.</p>';
    }
  }

  async function renameZone(zoneId, currentName) {
      const newName = prompt("Introduce el nuevo nombre para la zona:", currentName);
      if (!newName || newName.trim() === '' || newName === currentName) return;
      try {
          const { error } = await supabaseClient.from('saved_zones').update({ name: newName.trim() }).eq('id', zoneId);
          if (error) throw error;
          await displaySavedZones(); 
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
        statsContent.innerHTML = `<div class="text-center"><p class="text-5xl font-bold text-blue-400">${percentage}%</p><p class="mt-2 text-lg text-gray-300">de aciertos</p><p class="text-sm text-gray-400">(${totalCorrect} de ${totalPlayed} en las últimas partidas)</p></div>`;
    } catch (error) {
        console.error('Error cargando estadísticas:', error.message);
        statsContent.innerHTML = '<p class="text-red-400">Error al cargar estadísticas.</p>';
    }
  }

  googleLoginBtn.addEventListener('click', signInWithGoogle);
  supabaseClient.auth.onAuthStateChange(handleAuthStateChange);
});