// Importamos la función principal de nuestro nuevo módulo de revancha.
import { startRevanchaGame } from './modules/revancha-mode.js';
import { startInstintoGame } from './modules/instinto-mode.js';

window.addEventListener('DOMContentLoaded', () => {

  const SUPABASE_URL = 'https://hppzwfwtedghpsxfonoh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjQzNDMsImV4cCI6MjA2OTcwMDM0M30.BAh6i5iJ5YkDBoydfkC9azAD4eMdYBkEBdxws9kj5Hg';
  // Hacemos que supabaseClient sea accesible globalmente para que los módulos puedan usarlo.
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- Selectores de elementos DOM ---
  const uiElements = {
    loginScreen: document.getElementById('login-screen'),
    gameScreen: document.getElementById('game-screen'),
    backgroundMapContainer: document.getElementById('background-map'),
    googleLoginBtn: document.getElementById('google-login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    userInfoDetails: document.getElementById('user-info-details'),
    adminPanelBtn: document.getElementById('admin-panel-btn'),
    gameUiContainer: document.getElementById('game-ui-container'),
    drawZoneBtn: document.getElementById('drawZone'),
    undoPointBtn: document.getElementById('undoPoint'),
    startBtn: document.getElementById('start'),
    nextBtn: document.getElementById('next'),
    loaderContainer: document.getElementById('loader-container'),
    startOptions: document.getElementById('start-options'),
    includePOICheckbox: document.getElementById('include-poi-checkbox'),
    openMenuBtn: document.getElementById('open-menu-btn'),
    menuContentPanel: document.getElementById('menu-content-panel'),
    reportBtnFAB: document.getElementById('report-btn-fab'),
    loadedZoneOptions: document.getElementById('loaded-zone-options'),
    startLoadedZoneBtn: document.getElementById('startLoadedZone'),
    drawNewZoneBtn: document.getElementById('drawNewZone'),
    checkboxWrapper: document.querySelector('.checkbox-wrapper'),
    drawHelpContainer: document.getElementById('draw-help-container'),
    dismissDrawHelpBtn: document.getElementById('dismiss-draw-help'),
    gameInterface: document.getElementById('game-interface'),
    gameQuestion: document.getElementById('game-question'),
    scoreDisplayToggle: document.getElementById('score-display-toggle'),
    progressComponent: document.getElementById('progress-component'),
    progressBar: document.getElementById('progress-bar'),
    progressCounter: document.getElementById('progress-counter'),
    streakDisplay: document.getElementById('streak-display'),
    endGameOptions: document.getElementById('end-game-options'),
    finalScoreEl: document.getElementById('final-score'),
    reviewGameBtn: document.getElementById('review-game-btn'),
    repeatZoneBtn: document.getElementById('repeatZone'),
    saveZoneBtn: document.getElementById('saveZoneBtn'),
    backToMenuBtn: document.getElementById('back-to-menu-btn'),
    backFromReviewBtn: document.getElementById('back-from-review-btn'),
    // Añadimos el nuevo contenedor de opciones para que sea accesible
    instintoOptionsContainer: document.getElementById('instinto-options-container'),
  };

  let backgroundMap, gameMap = null;
  const COL_ZONE = '#663399', COL_TRACE = '#007a2f', COL_DASH = '#1976d2';
  let drawing=false, zonePoly=null, tempMarkers=[], zonePoints=[], oldZonePoly=null, reviewLayer=null;
  let playing=false, qIdx=0, target=null, userMk, guide, streetGrp;
  let streetList = [], totalQuestions = 0, streetsGuessedCorrectly = 0, lastGameZonePoints = [];
  let lastGameStreetList = [];
  let userProfile = { id: null, cityData: null, subscribedCity: null, role: null, showDrawHelp: true };
  let currentStreak = 0;
  let showScoreAsPercentage = false;

  let currentGameMode = 'classic'; 
  let acertadasEnSesionRevancha = new Set();
  let activeModeControls = null; // Variable para guardar los controles del modo activo

  // --- INICIO: CÓDIGO CORREGIDO (Regla #2) ---
  // Esta función ahora es la única responsable de la apariencia del modo
  function setGameMode(mode) {
    if (!mode) return;
    currentGameMode = mode;
    console.log(`Modo de juego cambiado a: ${currentGameMode}`);
    
    // 1. Lógica del color del título
    const title = uiElements.gameUiContainer.querySelector('.gradient-text');
    if (title) {
        // Primero, limpiamos todas las clases de color
        title.classList.remove('revancha-gradient', 'instinto-gradient');
        // Luego, añadimos solo la que corresponde
        if (mode === 'revancha') {
            title.classList.add('revancha-gradient');
        } else if (mode === 'instinto') {
            title.classList.add('instinto-gradient');
        }
    }

    // 2. Lógica del "tick" de selección
    document.querySelectorAll('.mode-select-btn').forEach(btn => {
        // Primero, limpiamos el tick de todos los botones
        btn.classList.remove('active-mode');
        // Luego, lo añadimos solo al botón del modo actual
        if (btn.dataset.mode === mode) {
            btn.classList.add('active-mode');
        }
    });
  }
  // --- FIN: CÓDIGO CORREGIDO (Regla #2) ---

  function updatePanelUI(updateFunction) {
      const heightBefore = uiElements.gameUiContainer.offsetHeight;
      updateFunction();
      const heightAfter = uiElements.gameUiContainer.offsetHeight;
      if (heightBefore !== heightAfter) {
          uiElements.gameUiContainer.classList.add('panel-pulse');
          setTimeout(() => uiElements.gameUiContainer.classList.remove('panel-pulse'), 400);
      }
  }

  async function signInWithGoogle() { 
    await supabaseClient.auth.signInWithOAuth({ 
      provider: 'google',
      options: { redirectTo: window.location.origin }
    }); 
  }
  async function signOut() { await supabaseClient.auth.signOut(); }
  
  async function checkRevanchaAvailability() {
      const revanchaBtn = document.querySelector('button[data-mode="revancha"]');
      if (!revanchaBtn) return;
      
      try {
          const { data: { session } } = await supabaseClient.auth.getSession();
          if (!session) {
              revanchaBtn.disabled = true;
              return;
          }
          const response = await fetch('/api/getRevanchaStreets', {
              headers: { 'Authorization': `Bearer ${session.access_token}` }
          });
          const data = await response.json();
          revanchaBtn.disabled = data.streets.length === 0;
      } catch(e) {
          console.error("Error al comprobar disponibilidad de revancha:", e);
          revanchaBtn.disabled = true;
      }
  }

  async function fetchUserProfile(user) {
    if (!user) return;
    try {
        const { data: profile, error } = await supabaseClient.from('profiles').select('role, subscribed_city, mostrar_ayuda_dibujo').eq('id', user.id).single();
        if (error) { throw error; }
        userProfile.id = user.id;
        userProfile.role = profile.role;
        userProfile.subscribedCity = profile.subscribed_city;
        userProfile.showDrawHelp = profile.mostrar_ayuda_dibujo;
        
        if (profile.role === 'admin') uiElements.adminPanelBtn.classList.remove('hidden');
        if (profile.subscribed_city) {
            const { data: city, error: cityError } = await supabaseClient.from('cities').select('*').eq('name', profile.subscribed_city).single();
            if (cityError) throw new Error(`No se encontraron datos para la ciudad: ${profile.subscribed_city}`);
            userProfile.cityData = city;
        }
        await checkRevanchaAvailability();
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
      uiElements.userInfoDetails.innerHTML = `<img src="${profileImageUrl}" alt="Avatar" class="w-16 h-16 mx-auto mb-3 rounded-full"><p class="font-semibold text-lg truncate">${userName}</p><p class="text-sm text-gray-400">${user.email}</p>`;
      uiElements.loginScreen.style.opacity = '0';
      uiElements.gameScreen.classList.remove('hidden');
      uiElements.logoutBtn.addEventListener('click', signOut);
      setTimeout(async () => {
          uiElements.loginScreen.classList.add('hidden');
          await fetchUserProfile(user);
          if (!gameMap) initGame();
          setTimeout(() => gameMap.invalidateSize(), 100);
      }, 500);
    } else {
      uiElements.loginScreen.classList.remove('hidden');
      uiElements.loginScreen.style.opacity = '1';
      uiElements.gameScreen.classList.add('hidden');
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
        if (!uiElements.menuContentPanel.classList.contains('hidden') && !uiElements.menuContentPanel.contains(event.target) && !uiElements.openMenuBtn.contains(event.target)) {
            uiElements.menuContentPanel.classList.add('hidden');
            document.removeEventListener('click', handleOutsideClick);
        }
    };
    uiElements.openMenuBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isHidden = uiElements.menuContentPanel.classList.toggle('hidden');
        if (!isHidden) {
            if (document.querySelector('.content-panel.active')?.id === 'modes-content') {
                checkRevanchaAvailability();
            }
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
        if (panelId === 'modes-content') await checkRevanchaAvailability();
      });
    });

    document.querySelectorAll('.mode-select-btn').forEach(button => {
        button.addEventListener('click', () => {
            const selectedMode = button.dataset.mode;
            if (button.disabled) return;

            // Limpiar el estado del modo anterior antes de cambiar
            if (activeModeControls && typeof activeModeControls.clear === 'function') {
                activeModeControls.clear();
            }
            activeModeControls = null;

            setGameMode(selectedMode);
            uiElements.menuContentPanel.classList.add('hidden');
            // --- INICIO: CAMBIO CLAVE ---
            // Se llama a la función de reseteo aquí, ANTES de iniciar la lógica del nuevo modo.
            resetToInitialView();
            // --- FIN: CAMBIO CLAVE ---

            if (selectedMode === 'revancha') {
                uiElements.drawZoneBtn.classList.add('hidden');
                startRevanchaGame({
                    startGame: (revanchaStreets) => {
                        streetList = revanchaStreets;
                        totalQuestions = revanchaStreets.length;
                        startGameFlow();
                    }
                });
            } else if (selectedMode === 'instinto') {
                activeModeControls = startInstintoGame({ ui: uiElements, gameMap: gameMap, updatePanelUI: updatePanelUI });
            }
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
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',{ attribution: '© OSM & CARTO', subdomains:'abcd', maxZoom:19, minZoom: userProfile.cityData ? initialZoom - 2 : 5 }).addTo(gameMap);
    gameMap.setView(initialCoords, initialZoom);
    if (userProfile.cityData) {
        const latOffset = 20 / 111.1, lngOffset = 20 / (111.1 * Math.cos(initialCoords[0] * Math.PI / 180));
        gameMap.setMaxBounds(L.latLngBounds(L.latLng(initialCoords[0] - latOffset, initialCoords[1] - lngOffset), L.latLng(initialCoords[0] + latOffset, initialCoords[1] + lngOffset)));
    }
    gameMap.invalidateSize();
    
    setGameMode('classic');

    uiElements.drawZoneBtn.addEventListener('click', startDrawing);
    uiElements.undoPointBtn.addEventListener('click', undoLastPoint);
    
    uiElements.nextBtn.addEventListener('click', () => {
        if (currentGameMode === 'classic' || currentGameMode === 'revancha') {
            uiElements.nextBtn.disabled = true;
            nextQ();
        } else if (currentGameMode === 'instinto' && activeModeControls) {
            activeModeControls.next();
        }
    });

    uiElements.reportBtnFAB.addEventListener('click', reportIncident);
    uiElements.adminPanelBtn.addEventListener('click', () => { window.location.href = '/admin.html'; });
    uiElements.dismissDrawHelpBtn.addEventListener('click', dismissDrawHelp);
    uiElements.scoreDisplayToggle.addEventListener('click', toggleScoreDisplay);

    uiElements.reviewGameBtn.addEventListener('click', enterReviewMode);
    uiElements.saveZoneBtn.addEventListener('click', saveCurrentZone);

    uiElements.backToMenuBtn.addEventListener('click', () => {
        if (currentGameMode === 'revancha') {
            if (acertadasEnSesionRevancha.size > 0) {
                console.log("Saliendo del modo revancha. Borrando calles acertadas de la BD...");
                acertadasEnSesionRevancha.forEach(streetName => {
                    deleteFailedStreet(streetName);
                });
            }
        }
        setGameMode('classic');
        resetToInitialView();
    });
    
    uiElements.backFromReviewBtn.addEventListener('click', exitReviewMode);
    
    setupStartButton(uiElements.startBtn);
    setupMenu();

    document.addEventListener('keyup', (event) => {
        if (event.code === 'Space' && !uiElements.nextBtn.disabled) {
            event.preventDefault();
            uiElements.nextBtn.click();
        }
    });
  }

  async function dismissDrawHelp() {
      uiElements.drawHelpContainer.classList.add('hidden');
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
          uiElements.scoreDisplayToggle.textContent = feedbackText;
          if (feedbackColor) uiElements.scoreDisplayToggle.style.color = feedbackColor;
          setTimeout(() => { updateScoreDisplay(); }, 3000);
      } else {
          uiElements.scoreDisplayToggle.style.color = '#555';
          const answeredQuestions = qIdx;
          if(showScoreAsPercentage){
              const percentage = answeredQuestions > 0 ? Math.round((streetsGuessedCorrectly / answeredQuestions) * 100) : 0;
              uiElements.scoreDisplayToggle.textContent = `Aciertos: ${percentage}%`;
          } else {
              uiElements.scoreDisplayToggle.textContent = `Calles acertadas: ${streetsGuessedCorrectly} / ${answeredQuestions}`;
          }
      }
  }

  function startGameFlow() {
      acertadasEnSesionRevancha.clear();

      playing = true; qIdx = 0; streetsGuessedCorrectly = 0; currentStreak = 0;
      updatePanelUI(() => {
          uiElements.gameInterface.classList.remove('hidden');
          uiElements.progressBar.style.width = '0%';
          if (currentGameMode === 'revancha' && streetList.length > 0) {
              const allBounds = L.latLngBounds();
              streetList.forEach(street => {
                  street.geometries.forEach(geom => {
                      allBounds.extend(L.latLngBounds(geom.points));
                  });
              });
              if(allBounds.isValid()) recenterMapWithPadding(allBounds);
          } else {
              recenterMapWithPadding();
          }
      });
      uiElements.reportBtnFAB.classList.remove('hidden');
      nextQ();
  }

  function setupStartButton(bStart) {
    const firstClickHandler = async () => {
        updatePanelUI(() => uiElements.startOptions.classList.add('hidden'));
        if (oldZonePoly) gameMap.removeLayer(oldZonePoly);
        if (!zonePoly) return;
        if (drawing) {
            drawing = false;
            gameMap.off('click', addVertex);
            tempMarkers.forEach(m => gameMap.removeLayer(m));
            tempMarkers = [];
            uiElements.drawHelpContainer.classList.add('hidden');
        }
        bStart.disabled = true;
        await preloadStreets();
        bStart.textContent = 'Iniciar juego';
        bStart.onclick = secondClickHandler;
        updatePanelUI(() => {
            uiElements.checkboxWrapper.classList.add('hidden'); 
            if (totalQuestions > 0) {
              bStart.disabled = false;
              uiElements.startOptions.classList.remove('hidden');
              uiElements.undoPointBtn.classList.add('hidden');
              uiElements.startBtn.classList.remove('hidden');
            } else {
              alert('No se encontraron calles válidas en esta zona. Por favor, dibuja otra.');
              resetToInitialView();
            }
        });
    };
    const secondClickHandler = () => {
        updatePanelUI(() => uiElements.startOptions.classList.add('hidden'));
        startGameFlow();
    };
    bStart.onclick = firstClickHandler;
  }

  function startDrawing(){
    if (currentGameMode !== 'classic') return; // <-- Guardia para no ejecutar en otros modos

    updatePanelUI(() => {
        ['end-game-options', 'drawZone', 'loaded-zone-options', 'game-interface', 'back-from-review-btn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        if (userProfile.showDrawHelp) uiElements.drawHelpContainer.classList.remove('hidden');
        uiElements.checkboxWrapper.classList.remove('hidden');
        uiElements.startOptions.classList.remove('hidden');
        uiElements.undoPointBtn.classList.remove('hidden');
        uiElements.startBtn.disabled = true;
        uiElements.startBtn.textContent = 'Start';
        uiElements.includePOICheckbox.disabled = false;
    });
    clear(true);
    if (zonePoly) gameMap.removeLayer(zonePoly);
    zonePoints = []; tempMarkers = []; zonePoly = null;
    playing = false; drawing = true;
    setupStartButton(uiElements.startBtn);
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
    if(zonePoints.length >= 3 && uiElements.startBtn.disabled) {
        updatePanelUI(() => { uiElements.startBtn.disabled = false; });
    }
  }

  function finishPolygon(){
    updatePanelUI(() => {
        drawing = false;
        gameMap.off('click', addVertex);
        tempMarkers.forEach(m=>gameMap.removeLayer(m));
        tempMarkers = [];
        zonePoly.addLatLng(zonePoints[0]);
        uiElements.undoPointBtn.classList.add('hidden');
        uiElements.startBtn.disabled = false;
        uiElements.drawHelpContainer.classList.add('hidden');
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
        if (zonePoints.length < 3) uiElements.startBtn.disabled = true;
    });
  }

  async function deleteFailedStreet(streetName) {
      try {
          const { data: { session } } = await supabaseClient.auth.getSession();
          if (!session) return;

          await fetch('/api/deleteFailure', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`
              },
              body: JSON.stringify({ osm_name: streetName })
          });
          console.log(`Calle "${streetName}" eliminada de la lista de revancha.`);
      } catch (error) {
          console.error(`Error al eliminar la calle "${streetName}" de la revancha:`, error);
      }
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
        if (currentGameMode === 'revancha') {
            const acertada = streetList[qIdx - 1];
            acertadasEnSesionRevancha.add(acertada.googleName);
            console.log("Aciertos en esta sesión:", Array.from(acertadasEnSesionRevancha));
        }

        streetsGuessedCorrectly++;
        currentStreak++;
        updateScoreDisplay('¡Correcto!', '#28a745');
        document.getElementById('correct-sound')?.play().catch(e => {});
        feedbackClass = 'panel-pulse-correct';
        if (currentStreak >= 3) {
            uiElements.streakDisplay.textContent = `¡Racha de ${currentStreak}!`;
            uiElements.streakDisplay.classList.add('visible');
        }

      } else {
        if (currentGameMode === 'classic' && target && streetList[qIdx - 1]) {
            const failedStreetData = {
                googleName: streetList[qIdx - 1].googleName,
                geometries: streetList[qIdx - 1].geometries,
                city: userProfile.subscribedCity
            };
            saveFailedStreet(failedStreetData);
        }
        
        currentStreak = 0;
        uiElements.streakDisplay.classList.remove('visible');
        updateScoreDisplay(`Casi... a ${Math.round(streetCheck.distance)} metros.`, '#c82333');
        document.getElementById('incorrect-sound')?.play().catch(e => {});
        feedbackClass = 'panel-pulse-incorrect';
      }
      
      uiElements.gameUiContainer.classList.add(feedbackClass);
      uiElements.gameUiContainer.addEventListener('animationend', () => {
          uiElements.gameUiContainer.classList.remove(feedbackClass);
      }, { once: true });

      const progress = totalQuestions > 0 ? ((qIdx) / totalQuestions) * 100 : 0;
      uiElements.progressBar.style.width = `${progress}%`;
      
      if (streetCheck.point) guide = L.polyline([userMk.getLatLng(), streetCheck.point], { dashArray:'6 4', color:COL_DASH }).addTo(gameMap);
    } else {
      updateScoreDisplay('Error: No se pudo dibujar el lugar.', '#c82333');
    }

    uiElements.nextBtn.disabled=false;
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
        if (drawing) {
            gameMap.off('click', addVertex);
            drawing = false;
        }
        if(tempMarkers.length > 0) {
            tempMarkers.forEach(m => gameMap.removeLayer(m));
            tempMarkers = [];
        }
    }
  }

  async function preloadStreets() {
      uiElements.loaderContainer.classList.remove('hidden');
      try {
          const zoneParam = zonePoints.map(p => `${p.lat},${p.lng}`).join(';');
          const includePOI = uiElements.includePOICheckbox.checked;
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
          uiElements.loaderContainer.classList.add('hidden');
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
        lastGameZonePoints = [...zonePoints];
        lastGameStreetList = [...streetList];
        playing = false;
        uiElements.gameInterface.classList.add('hidden');
        uiElements.finalScoreEl.textContent = `¡Partida terminada! Puntuación: ${streetsGuessedCorrectly} / ${totalQuestions}`;
        
        uiElements.drawZoneBtn.classList.add('hidden');

        if (currentGameMode === 'revancha') {
            uiElements.saveZoneBtn.classList.add('hidden');
            uiElements.repeatZoneBtn.textContent = 'Jugar Revancha de Nuevo';
            uiElements.repeatZoneBtn.onclick = () => {
                uiElements.endGameOptions.classList.add('hidden'); 
                startRevanchaGame({
                     startGame: (revanchaStreets) => {
                        streetList = revanchaStreets;
                        totalQuestions = revanchaStreets.length;
                        startGameFlow();
                    }
                });
            };
            uiElements.repeatZoneBtn.disabled = false;
        } else { // Modo clásico
            uiElements.saveZoneBtn.classList.remove('hidden');
            uiElements.repeatZoneBtn.textContent = 'Repetir Zona';
            uiElements.repeatZoneBtn.onclick = repeatLastZone; 
            uiElements.repeatZoneBtn.disabled = (lastGameZonePoints.length < 3 || lastGameStreetList.length === 0);
        }

        uiElements.endGameOptions.classList.remove('hidden');
        uiElements.backToMenuBtn.classList.remove('hidden');
        
        if (zonePoly) {
            zonePoly.setStyle({ color: '#696969', weight: 2, dashArray: '5, 5', fillOpacity: 0.05 });
            oldZonePoly = zonePoly;
        }

        saveGameStats(streetsGuessedCorrectly, totalQuestions);
        
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
          uiElements.endGameOptions.classList.add('hidden');
          uiElements.backFromReviewBtn.classList.remove('hidden');
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
          uiElements.backFromReviewBtn.classList.add('hidden');
          uiElements.endGameOptions.classList.remove('hidden');
      });
  }
  
  function recenterMapWithPadding(bounds = null) {
      if (!gameMap) return;
      const targetBounds = bounds || (zonePoly ? zonePoly.getBounds() : null);
      if (!targetBounds || !targetBounds.isValid()) return;

      const panelWidth = uiElements.gameUiContainer.offsetWidth;
      gameMap.fitBounds(targetBounds, {
          paddingTopLeft: [panelWidth + 20, 20],
          paddingBottomRight: [20, 20]
      });
  }

  function nextQ(){
    if (currentGameMode === 'classic') {
        recenterMapWithPadding();
    }

    clear();
    if(qIdx >= totalQuestions){
        setTimeout(endGame, 500);
        return; 
    }
    
    gameMap.on('click', onMapClick);
    const s = streetList[qIdx];
    target = s.geometries;
    
    updatePanelUI(() => {
        uiElements.gameQuestion.textContent = `¿Dónde está «${s.googleName}»?`;
        updateScoreDisplay();
        if (currentStreak < 3) uiElements.streakDisplay.classList.remove('visible');
        uiElements.progressCounter.textContent = `${qIdx + 1} / ${totalQuestions}`;
    });

    qIdx++;
    uiElements.nextBtn.disabled = true;
  }
  
  // --- INICIO: FUNCIÓN DE RESETEO "MAESTRA" MODIFICADA ---
  // Esta función ahora es la responsable de hacer una limpieza COMPLETA
  // tanto de la interfaz como del estado de la partida anterior.
  function resetToInitialView() {
      // 1. Limpiar estado del modo anterior si existe (para modos complejos como Instinto)
      if (activeModeControls && typeof activeModeControls.clear === 'function') {
        activeModeControls.clear();
      }
      activeModeControls = null;

      // 2. Limpiar todas las capas del mapa
      clear(true);

      // 3. Resetear TODAS las variables de estado de la partida
      streetList = [];
      totalQuestions = 0;
      streetsGuessedCorrectly = 0;
      qIdx = 0;
      currentStreak = 0;
      playing = false;
      zonePoints = [];
      zonePoly = null;
      oldZonePoly = null;

      // 4. Resetear la interfaz de usuario a su estado inicial
      updatePanelUI(() => {
          // Ocultar TODOS los contenedores de juego
          ['start-options', 'loaded-zone-options', 'checkbox-wrapper', 'game-interface', 'end-game-options', 'back-from-review-btn'].forEach(id => {
              const el = document.getElementById(id);
              if (el) el.classList.add('hidden');
          });
          
          // Ocultar botones flotantes
          uiElements.reportBtnFAB.classList.add('hidden');

          // Mostrar solo el botón inicial
          uiElements.drawZoneBtn.classList.remove('hidden');
          
          // Limpiar cualquier contenido dinámico
          uiElements.progressBar.style.width = '0%';
          uiElements.instintoOptionsContainer.innerHTML = '';
          uiElements.gameQuestion.textContent = '';
          uiElements.progressCounter.textContent = '';
          uiElements.scoreDisplayToggle.textContent = '';
          uiElements.streakDisplay.classList.remove('visible');
      });

      // 5. Restablecer el modo de juego por defecto si es necesario (manejado fuera)
  }
  // --- FIN: FUNCIÓN DE RESETEO "MAESTRA" ---


  function playFromHistory(zoneString) {
    // --- INICIO: CAMBIO CLAVE ---
    // Se llama a la función de reseteo MAESTRA al principio para asegurar
    // que cualquier estado anterior (como estar en modo revisión) se limpie por completo.
    resetToInitialView();
    // --- FIN: CAMBIO CLAVE ---
    
    gameMap.off('click', addVertex);
    const points = zoneString.split(';').map(pair => {
      const [lat, lng] = pair.split(',');
      return { lat: parseFloat(lat), lng: parseFloat(lng) };
    });
    if (points.length < 3) return;
    
    updatePanelUI(() => {
        // La limpieza principal ya la hizo resetToInitialView, aquí solo mostramos lo necesario
        uiElements.drawZoneBtn.classList.add('hidden');
        
        // El resto de la lógica de esta función para dibujar la zona y mostrar los botones correctos
        tempMarkers.forEach(m => gameMap.removeLayer(m));
        tempMarkers = [];
        zonePoints = points.map(p => L.latLng(p.lat, p.lng));
        zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
        
        uiElements.startLoadedZoneBtn.onclick = async () => {
            updatePanelUI(() => {
                uiElements.loadedZoneOptions.classList.add('hidden');
                uiElements.checkboxWrapper.classList.add('hidden');
            });
            await preloadStreets(); 
            if (totalQuestions > 0) {
                startGameFlow();
            } else {
                alert('No se encontraron calles válidas en esta zona.');
                resetToInitialView();
            }
        };
        uiElements.drawNewZoneBtn.onclick = () => resetToInitialView();
        uiElements.loadedZoneOptions.classList.remove('hidden');
        uiElements.checkboxWrapper.classList.remove('hidden');
        uiElements.includePOICheckbox.disabled = false;
    });
    
    uiElements.menuContentPanel.classList.add('hidden'); 
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

async function saveFailedStreet(streetData) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            return;
        }
        const requestBody = {
            osm_name: streetData.googleName,
            city: streetData.city,
            geometries: streetData.geometries
        };
        const response = await fetch('/api/saveFailure', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
           console.error('La API de guardado de fallos devolvió un error.', await response.json());
        } else {
           console.log(`Fallo en "${streetData.googleName}" registrado para el modo revancha.`);
        }
    } catch (error) {
        console.error('Error al intentar guardar la calle fallada:', error.message);
    }
}
  
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
        uiElements.saveZoneBtn.classList.add('hidden');
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

  uiElements.googleLoginBtn.addEventListener('click', signInWithGoogle);
  supabaseClient.auth.onAuthStateChange(handleAuthStateChange);
});