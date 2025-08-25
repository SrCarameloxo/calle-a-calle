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
    emailAuthForm: document.getElementById('email-auth-form'),
    emailInput: document.getElementById('email-input'),
    passwordInput: document.getElementById('password-input'),
    loginBtn: document.getElementById('login-btn'),
    registerBtn: document.getElementById('register-btn'),
    authMessage: document.getElementById('auth-message'),
    logoutBtn: document.getElementById('logout-btn'),
    userInfoDetails: document.getElementById('user-info-details'),
    adminPanelBtn: document.getElementById('admin-panel-btn'),
    editorModeBtn: document.getElementById('editor-mode-btn'),
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
    instintoOptionsContainer: document.getElementById('instinto-options-container'),
    settings: {
        toggleHeader: document.getElementById('settings-toggle-header'),
        arrow: document.querySelector('.settings-arrow'),
        content: document.getElementById('user-settings-section'),
        soundsEnabled: document.getElementById('setting-sounds-enabled'),
        soundVolume: document.getElementById('setting-sound-volume'),
        streetAnimation: document.getElementById('setting-street-animation'),
        feedbackAnimation: document.getElementById('setting-feedback-animation'),
        volumeControlWrapper: document.getElementById('volume-control-wrapper')
    }
  };

  let backgroundMap, gameMap = null;
  const COL_ZONE = '#663399', COL_TRACE = '#007a2f', COL_FAIL_TRACE = '#FF0033', COL_DASH = '#1976d2';
  let drawing=false, zonePoly=null, tempMarkers=[], zonePoints=[], oldZonePoly=null, reviewLayer=null;
  let playing=false, qIdx=0, target=null, userMk, guide, streetGrp;
  let streetList = [], totalQuestions = 0, streetsGuessedCorrectly = 0, lastGameZonePoints = [];
  let lastGameStreetList = [];
  let userProfile = { 
    id: null, 
    cityData: null, 
    subscribedCity: null, 
    role: null, 
    showDrawHelp: true,
    settings: {
        enable_sounds: true,
        sound_volume: 0.5,
        enable_street_animation: true,
        enable_feedback_animation: true
    }
  };
  let currentStreak = 0;
  let maxStreak = 0;
  let gameStartTime = null;
  let showScoreAsPercentage = false;

  let currentGameMode = 'classic'; 
  let acertadasEnSesionRevancha = new Set();
  let activeModeControls = null;
  let currentReportContext = null;

  function setReportContext(context) {
      currentReportContext = context;
  }

  function setGameMode(mode) {
    if (!mode) return;
    currentGameMode = mode;
    console.log(`Modo de juego cambiado a: ${currentGameMode}`);
    
    const title = uiElements.gameUiContainer.querySelector('.gradient-text');
    if (title) {
        title.classList.remove('revancha-gradient', 'instinto-gradient');
        if (mode === 'revancha') {
            title.classList.add('revancha-gradient');
        } else if (mode === 'instinto') {
            title.classList.add('instinto-gradient');
        }
    }

    document.querySelectorAll('.mode-select-btn').forEach(btn => {
        btn.classList.remove('active-mode');
        if (btn.dataset.mode === mode) {
            btn.classList.add('active-mode');
        }
    });
  }

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

  async function signInWithEmail() {
    const email = uiElements.emailInput.value.trim();
    const password = uiElements.passwordInput.value;

    if (!email || !password) {
      showAuthMessage('Por favor, completa todos los campos', 'error');
      return;
    }

    showAuthMessage('Iniciando sesión...', 'loading');

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        let errorMessage = 'Error al iniciar sesión';
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = 'Email o contraseña incorrectos';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = 'Por favor, confirma tu email antes de iniciar sesión';
        }
        showAuthMessage(errorMessage, 'error');
      } else {
        showAuthMessage('¡Inicio de sesión exitoso!', 'success');
      }
    } catch (error) {
      showAuthMessage('Error de conexión', 'error');
    }
  }

  async function signUpWithEmail() {
    const email = uiElements.emailInput.value.trim();
    const password = uiElements.passwordInput.value;

    if (!email || !password) {
      showAuthMessage('Por favor, completa todos los campos', 'error');
      return;
    }

    if (password.length < 6) {
      showAuthMessage('La contraseña debe tener al menos 6 caracteres', 'error');
      return;
    }

    showAuthMessage('Creando cuenta...', 'loading');

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
      });

      if (error) {
        let errorMessage = 'Error al crear la cuenta';
        if (error.message.includes('User already registered')) {
          errorMessage = 'Este email ya está registrado';
        }
        showAuthMessage(errorMessage, 'error');
      } else {
        showAuthMessage('¡Cuenta creada! Revisa tu email para confirmarla', 'success');
      }
    } catch (error) {
      showAuthMessage('Error de conexión', 'error');
    }
  }

  function showAuthMessage(message, type) {
    uiElements.authMessage.textContent = message;
    uiElements.authMessage.className = `mt-4 p-3 rounded-lg text-center ${type}`;
    uiElements.authMessage.classList.remove('hidden');
    
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        uiElements.authMessage.classList.add('hidden');
      }, 5000);
    }
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
        const { data: profile, error } = await supabaseClient.from('profiles')
          .select('role, subscribed_city, mostrar_ayuda_dibujo, enable_sounds, sound_volume, enable_street_animation, enable_feedback_animation')
          .eq('id', user.id)
          .single();
        if (error) { throw error; }

        userProfile.id = user.id;
        userProfile.role = profile.role;
        userProfile.subscribedCity = profile.subscribed_city;
        userProfile.showDrawHelp = profile.mostrar_ayuda_dibujo;
        userProfile.settings = {
            enable_sounds: profile.enable_sounds,
            sound_volume: profile.sound_volume,
            enable_street_animation: profile.enable_street_animation,
            enable_feedback_animation: profile.enable_feedback_animation
        };
        updateSettingsUI();
        
        if (profile.role === 'admin') {
            uiElements.adminPanelBtn.classList.remove('hidden');
            uiElements.editorModeBtn.classList.remove('hidden');
        }
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
      // Limpiar formulario de login
      uiElements.emailInput.value = '';
      uiElements.passwordInput.value = '';
      uiElements.authMessage.classList.add('hidden');
      
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
            
            if (activeModeControls && typeof activeModeControls.clear === 'function') {
                activeModeControls.clear(true);
            }

            activeModeControls = null;
            setGameMode(selectedMode);
            resetToInitialView();
            uiElements.menuContentPanel.classList.add('hidden');

            if (selectedMode === 'classic') {
                uiElements.drawZoneBtn.classList.remove('hidden');
            } else if (selectedMode === 'revancha') {
                uiElements.drawZoneBtn.classList.add('hidden');
                startRevanchaGame({
                    startGame: (revanchaStreets) => {
                        streetList = revanchaStreets;
                        totalQuestions = revanchaStreets.length;
                        startGameFlow();
                    }
                });
            } else if (selectedMode === 'instinto') {
                uiElements.drawZoneBtn.classList.remove('hidden');
                activeModeControls = startInstintoGame({ 
                    ui: uiElements, 
                    gameMap: gameMap, 
                    updatePanelUI: updatePanelUI, 
                    userProfile: userProfile,
                    setReportContext: setReportContext 
                });
            }
        });
    });
  }

  function updateSettingsUI() {
    uiElements.settings.soundsEnabled.checked = userProfile.settings.enable_sounds;
    uiElements.settings.soundVolume.value = userProfile.settings.sound_volume;
    uiElements.settings.streetAnimation.checked = userProfile.settings.enable_street_animation;
    uiElements.settings.feedbackAnimation.checked = userProfile.settings.enable_feedback_animation;

    if (userProfile.settings.enable_sounds) {
        uiElements.settings.volumeControlWrapper.classList.remove('disabled');
    } else {
        uiElements.settings.volumeControlWrapper.classList.add('disabled');
    }
  }

  async function updateUserSetting(key, value) {
    if (!userProfile.id) return;
    
    userProfile.settings[key] = value;

    const { error } = await supabaseClient
        .from('profiles')
        .update({ [key]: value })
        .eq('id', userProfile.id);

    if (error) {
        console.error(`Error al guardar el ajuste '${key}':`, error);
    }
  }
  
  function setupSettingsDropdown() {
    if (uiElements.settings.toggleHeader) {
        uiElements.settings.toggleHeader.addEventListener('click', () => {
            uiElements.settings.content.classList.toggle('open');
            uiElements.settings.arrow.classList.toggle('open');
        });
    }
  }

  function setupSettingsListeners() {
    uiElements.settings.soundsEnabled.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        updateUserSetting('enable_sounds', isEnabled);
        if (isEnabled) {
            uiElements.settings.volumeControlWrapper.classList.remove('disabled');
        } else {
            uiElements.settings.volumeControlWrapper.classList.add('disabled');
        }
    });

    uiElements.settings.soundVolume.addEventListener('input', (e) => {
        updateUserSetting('sound_volume', parseFloat(e.target.value));
    });

    uiElements.settings.streetAnimation.addEventListener('change', (e) => {
        updateUserSetting('enable_street_animation', e.target.checked);
    });

    uiElements.settings.feedbackAnimation.addEventListener('change', (e) => {
        updateUserSetting('enable_feedback_animation', e.target.checked);
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
    uiElements.editorModeBtn.addEventListener('click', () => { window.location.href = '/editor.html'; });
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
            setGameMode('classic');
        }
        resetToInitialView();
    });
    
    uiElements.backFromReviewBtn.addEventListener('click', exitReviewMode);
    
    setupStartButton(uiElements.startBtn);
    setupMenu();
    setupSettingsListeners(); 
    setupSettingsDropdown();

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
      maxStreak = 0; gameStartTime = Date.now();
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
    if (currentGameMode !== 'classic') return;

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
    
    let tempStreetGrp = L.layerGroup();
    if (target && Array.isArray(target) && target.length > 0) {
        target.forEach(geom => {
            if (geom.isClosed) L.polygon(geom.points).addTo(tempStreetGrp);
            else L.polyline(geom.points).addTo(tempStreetGrp);
        });
    }
    const streetCheck = getDistanceToStreet(userMk.getLatLng(), tempStreetGrp);
    let isCorrect = streetCheck.distance <= 30;

    streetGrp = drawStreet(isCorrect); 

    if(streetGrp){
      
      if (userProfile.settings.enable_street_animation) {
          streetGrp.eachLayer(layer => {
              const element = layer.getElement();
              if (element) {
                  const animationClass = isCorrect ? 'street-reveal-animation' : 'street-reveal-animation-fail';
                  element.classList.add(animationClass);
              }
          });
      }
      
      const feedbackClass = isCorrect ? 'panel-pulse-correct' : 'panel-pulse-incorrect';

      if (isCorrect) {
        if (currentGameMode === 'revancha') {
            const acertada = streetList[qIdx - 1];
            acertadasEnSesionRevancha.add(acertada.googleName);
            console.log("Aciertos en esta sesión:", Array.from(acertadasEnSesionRevancha));
        }

        streetsGuessedCorrectly++;
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
        updateScoreDisplay('¡Correcto!', '#28a745');
        if (userProfile.settings.enable_sounds) {
            const sound = document.getElementById('correct-sound');
            if(sound) {
                sound.volume = userProfile.settings.sound_volume;
                sound.play().catch(e => {});
            }
        }
        
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
        updateScoreDisplay(`Casi... a ${Math.round(streetCheck.distance)} metros.`, COL_FAIL_TRACE);
        if (userProfile.settings.enable_sounds) {
            const sound = document.getElementById('incorrect-sound');
            if (sound) {
                sound.volume = userProfile.settings.sound_volume;
                sound.play().catch(e => {});
            }
        }
      }
      
      if (userProfile.settings.enable_feedback_animation) {
          uiElements.gameUiContainer.classList.add(feedbackClass);
          uiElements.gameUiContainer.addEventListener('animationend', () => {
              uiElements.gameUiContainer.classList.remove(feedbackClass);
          }, { once: true });
      }

      const progress = totalQuestions > 0 ? ((qIdx) / totalQuestions) * 100 : 0;
      uiElements.progressBar.style.width = `${progress}%`;
      
      if (streetCheck.point) guide = L.polyline([userMk.getLatLng(), streetCheck.point], { dashArray:'6 4', color:COL_DASH }).addTo(gameMap);
    } else {
      updateScoreDisplay('Error: No se pudo dibujar el lugar.', COL_FAIL_TRACE);
    }

    uiElements.nextBtn.disabled=false;
  }

  function clear(clearFull=false){ 
    [userMk, guide, streetGrp].forEach(layer => {
        if (layer && gameMap.hasLayer(layer)) gameMap.removeLayer(layer);
    });
    userMk = guide = streetGrp = null;
    if(clearFull){
        if(zonePoly) gameMap.removeLayer(zonePoly);
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
  
  function drawStreet(isCorrect){
    const g = L.layerGroup().addTo(gameMap);
    if (!target || !Array.isArray(target) || target.length === 0) return null;
    
    const traceColor = isCorrect ? COL_TRACE : COL_FAIL_TRACE;

    target.forEach(geom => {
        if (geom.isClosed) L.polygon(geom.points, { color: traceColor, weight: 4, fillOpacity: 0.2 }).addTo(g);
        else L.polyline(geom.points, { color: traceColor, weight: 8 }).addTo(g);
    });
    return g;
  }

  // --- INICIO DE LA MODIFICACIÓN ---
  function getDistanceToStreet(userPoint, streetLayer) {
      let minDistancePixels = Infinity;
      let closestPointOnStreet = null;
  
      streetLayer.eachLayer(layer => {
          const latlngs = (layer instanceof L.Polygon) ? layer.getLatLngs()[0] : (layer instanceof L.Polyline) ? layer.getLatLngs() : [];
          if (latlngs.length < 2) return;
  
          for (let i = 0; i < latlngs.length - 1; i++) {
              const p1 = gameMap.latLngToLayerPoint(latlngs[i]);
              const p2 = gameMap.latLngToLayerPoint(latlngs[i + 1]);
              const p = gameMap.latLngToLayerPoint(userPoint);
              
              let x = p1.x, y = p1.y, dx = p2.x - x, dy = p2.y - y;
              
              if (dx !== 0 || dy !== 0) {
                  const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
                  if (t > 1) {
                      x = p2.x;
                      y = p2.y;
                  } else if (t > 0) {
                      x += dx * t;
                      y += dy * t;
                  }
              }
              
              dx = p.x - x;
              dy = p.y - y;
              const dist = dx * dx + dy * dy;
              
              if (dist < minDistancePixels) {
                  minDistancePixels = dist;
                  closestPointOnStreet = gameMap.layerPointToLatLng(L.point(x, y));
              }
          }
      });
  
      const finalDistanceInMeters = closestPointOnStreet ? userPoint.distanceTo(closestPointOnStreet) : Infinity;
      return { distance: finalDistanceInMeters, point: closestPointOnStreet };
  }
  // --- FIN DE LA MODIFICACIÓN ---

  function endGame() {
    if (currentGameMode === 'instinto') {
        console.warn("Llamada a endGame() genérico prevenida durante el modo Instinto.");
        return;
    }
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
        } else if (currentGameMode === 'classic') {
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
  
  function resetToInitialView() {
      if (currentGameMode === 'instinto' && activeModeControls && typeof activeModeControls.clear === 'function') {
        activeModeControls.clear(false); 
      } else {
        clear(true);
      }
      
      streetList = [];
      totalQuestions = 0;
      streetsGuessedCorrectly = 0;
      qIdx = 0;
      currentStreak = 0;
      playing = false;
      zonePoints = [];
      zonePoly = null;
      oldZonePoly = null;
      uiElements.repeatZoneBtn.onclick = null;
      uiElements.reviewGameBtn.onclick = null;
      uiElements.saveZoneBtn.onclick = null;
      
      updatePanelUI(() => {
          ['start-options', 'loaded-zone-options', 'checkbox-wrapper', 'game-interface', 'end-game-options', 'back-from-review-btn'].forEach(id => {
              const el = document.getElementById(id);
              if (el) el.classList.add('hidden');
          });
          uiElements.reportBtnFAB.classList.add('hidden');
          uiElements.drawZoneBtn.classList.remove('hidden');
          uiElements.progressBar.style.width = '0%';
          uiElements.instintoOptionsContainer.innerHTML = '';
          uiElements.gameQuestion.textContent = '';
          uiElements.progressCounter.textContent = '';
          uiElements.scoreDisplayToggle.textContent = '';
          uiElements.streakDisplay.classList.remove('visible');
          setReportContext(null);
      });
  }

  function playFromHistory(zoneString) {
    resetToInitialView();
    gameMap.off('click', addVertex);
    const points = zoneString.split(';').map(pair => {
      const [lat, lng] = pair.split(',');
      return { lat: parseFloat(lat), lng: parseFloat(lng) };
    });
    if (points.length < 3) return;

    if (currentGameMode === 'instinto') {
        if (activeModeControls && activeModeControls.startWithZone) {
            const instintoZonePoints = points.map(p => L.latLng(p.lat, p.lng));
            
            zonePoints = instintoZonePoints; 
            zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
            
            activeModeControls.startWithZone(instintoZonePoints);

            uiElements.menuContentPanel.classList.add('hidden'); 
            recenterMapWithPadding(zonePoly.getBounds());
            
            return; 
        } else {
             console.error("Error: Modo Instinto activo pero su controlador no está disponible.");
             alert("Ha ocurrido un error al cargar la zona en Modo Instinto.");
             return;
        }
    }
    
    updatePanelUI(() => {
        uiElements.drawZoneBtn.classList.add('hidden');
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
    let pointsToReport;
    let cityToReport = userProfile.subscribedCity;
    let contextDescription = "Incidencia en zona general.";

    if (currentReportContext) {
        pointsToReport = currentReportContext.geometries.flatMap(g => g.points.map(p => ({ lat: p[0], lng: p[1] })));
        cityToReport = currentReportContext.city;
        contextDescription = "Incidencia sobre una calle específica.";
    } else {
        pointsToReport = playing ? zonePoints : lastGameZonePoints;
        contextDescription = "Incidencia en zona general.";
    }
    
    if (!pointsToReport || pointsToReport.length === 0) {
      alert("No hay una zona o calle activa para reportar una incidencia.");
      return;
    }

    const description = prompt(`Por favor, describe la incidencia (ej. 'Falta la calle X', 'El nombre es incorrecto', etc.).\n\nContexto: ${contextDescription}`);
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
            city: cityToReport
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

        // Preparar coordenadas de la zona para el mapa de calor
        const zonePolygon = zonePoints.length > 0 ? zonePoints.map(p => [p.lat, p.lng]) : null;
        
        const gameData = {
            user_id: session.user.id,
            correct_guesses: correct,
            total_questions: total,
            zone_polygon: zonePolygon ? JSON.stringify(zonePolygon) : null
        };
        
        // Campos adicionales que se pueden añadir cuando se actualice la base de datos:
        // accuracy_percentage: Math.round((correct / total) * 100),
        // game_mode: currentGameMode || 'classic',
        // zone_name: getCurrentZoneName() || null,
        // duration_seconds: Math.floor((Date.now() - gameStartTime) / 1000),
        // max_streak: maxStreak || 0

        await supabaseClient.from('game_stats').insert(gameData);
        console.log('Estadísticas guardadas correctamente');
    } catch (error) {
        console.error('Error guardando estadísticas:', error.message);
    }
  }

  function getCurrentZoneName() {
    // Generar nombre descriptivo basado en el centro de la zona
    if (zonePoints.length === 0) return null;
    
    const centerLat = zonePoints.reduce((sum, p) => sum + p.lat, 0) / zonePoints.length;
    const centerLng = zonePoints.reduce((sum, p) => sum + p.lng, 0) / zonePoints.length;
    
    return `Zona (${centerLat.toFixed(3)}, ${centerLng.toFixed(3)})`;
  }

  async function displayStats() {
    const statsContent = document.getElementById('stats-list');
    statsContent.innerHTML = '<p>Calculando estadísticas...</p>';
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        
        const { data: stats, error } = await supabaseClient.from('game_stats')
            .select('correct_guesses, total_questions, created_at')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(50);
            
        if (error) throw error;
        
        if (stats.length === 0) {
            statsContent.innerHTML = `
                <div class="text-center py-8 space-y-4">
                    <div class="w-16 h-16 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-2xl">🎯</div>
                    <h3 class="text-xl font-bold text-white">Aún sin datos</h3>
                    <p class="text-gray-400 max-w-xs mx-auto">Completa tu primera partida para comenzar a rastrear tu progreso geográfico</p>
                </div>
            `;
            return;
        }
        
        // Calcular estadísticas generales usando solo las columnas existentes
        const totalCorrect = stats.reduce((sum, game) => sum + game.correct_guesses, 0);
        const totalPlayed = stats.reduce((sum, game) => sum + game.total_questions, 0);
        const totalGames = stats.length;
        
        // Calcular precisión por partida y promedio
        const gamesWithAccuracy = stats.map(game => ({
            ...game,
            accuracy_percentage: game.total_questions > 0 ? Math.round((game.correct_guesses / game.total_questions) * 100) : 0
        }));
        
        const averageAccuracy = totalPlayed > 0 ? Math.round((totalCorrect / totalPlayed) * 100) : 0;
        const bestGame = gamesWithAccuracy.reduce((best, game) => 
            game.accuracy_percentage > best.accuracy_percentage ? game : best, gamesWithAccuracy[0] || {accuracy_percentage: 0});
        const recentGames = gamesWithAccuracy.slice(0, 5);
        
        // Estadísticas por modo de juego (solo modo clásico por ahora, ya que no tenemos la columna game_mode)
        const modeStats = {
            'classic': {
                games: totalGames,
                accuracy: averageAccuracy,
                totalCorrect: totalCorrect,
                totalPlayed: totalPlayed
            }
        };
        
        // Racha de días jugados
        const playDates = [...new Set(stats.map(game => new Date(game.created_at).toDateString()))];
        const streakDays = calculatePlayStreak(playDates);
        
        statsContent.innerHTML = `
            <div class="space-y-5">
                <!-- Estadística principal más elegante -->
                <div class="relative overflow-hidden">
                    <div class="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-blue-600/10"></div>
                    <div class="relative p-6 text-center border border-gray-600/30 rounded-xl backdrop-blur-sm">
                        <div class="text-5xl font-light text-white mb-2">${averageAccuracy}<span class="text-2xl text-gray-400">%</span></div>
                        <div class="text-sm font-medium text-gray-300 uppercase tracking-wider mb-1">Precisión Media</div>
                        <div class="text-xs text-gray-500">${totalCorrect} aciertos de ${totalPlayed} intentos</div>
                    </div>
                </div>
                
                <!-- Métricas en grid más profesional -->
                <div class="grid grid-cols-2 gap-3">
                    <div class="bg-gray-800/30 border border-gray-700/40 rounded-lg p-4 hover:bg-gray-800/40 transition-colors">
                        <div class="flex items-center justify-between">
                            <div class="text-2xl font-bold text-emerald-400">${totalGames}</div>
                            <div class="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                                <span class="text-emerald-400 text-sm">📊</span>
                            </div>
                        </div>
                        <div class="text-xs text-gray-400 uppercase tracking-wide mt-1">Partidas Totales</div>
                    </div>
                    
                    <div class="bg-gray-800/30 border border-gray-700/40 rounded-lg p-4 hover:bg-gray-800/40 transition-colors">
                        <div class="flex items-center justify-between">
                            <div class="text-2xl font-bold text-amber-400">${bestGame.accuracy_percentage}<span class="text-sm">%</span></div>
                            <div class="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
                                <span class="text-amber-400 text-sm">🎯</span>
                            </div>
                        </div>
                        <div class="text-xs text-gray-400 uppercase tracking-wide mt-1">Mejor Resultado</div>
                    </div>
                    
                    <div class="bg-gray-800/30 border border-gray-700/40 rounded-lg p-4 hover:bg-gray-800/40 transition-colors">
                        <div class="flex items-center justify-between">
                            <div class="text-2xl font-bold text-violet-400">${streakDays}</div>
                            <div class="w-8 h-8 bg-violet-500/20 rounded-lg flex items-center justify-center">
                                <span class="text-violet-400 text-sm">📅</span>
                            </div>
                        </div>
                        <div class="text-xs text-gray-400 uppercase tracking-wide mt-1">Días Activos</div>
                    </div>
                    
                    <div class="bg-gray-800/30 border border-gray-700/40 rounded-lg p-4 hover:bg-gray-800/40 transition-colors">
                        <div class="flex items-center justify-between">
                            <div class="text-2xl font-bold text-cyan-400">${totalCorrect}</div>
                            <div class="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                                <span class="text-cyan-400 text-sm">✓</span>
                            </div>
                        </div>
                        <div class="text-xs text-gray-400 uppercase tracking-wide mt-1">Total Aciertos</div>
                    </div>
                </div>
                
                <!-- Progreso reciente más elegante -->
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <h4 class="text-sm font-medium text-gray-300">Progreso Reciente</h4>
                        <span class="text-xs text-gray-500">Últimas ${recentGames.length} partidas</span>
                    </div>
                    <div class="space-y-2">
                        <div class="flex space-x-1 h-2">
                            ${recentGames.map(game => `
                                <div class="flex-1 rounded-full ${getAccuracyColor(game.accuracy_percentage || 0)} opacity-80 hover:opacity-100 transition-opacity" 
                                     title="${game.accuracy_percentage}% - ${new Date(game.created_at).toLocaleDateString()}"></div>
                            `).join('')}
                        </div>
                        <div class="flex justify-between text-xs text-gray-500">
                            <span>Más antigua</span>
                            <span>Más reciente</span>
                        </div>
                    </div>
                </div>
                
                <!-- Botón expandir mejorado -->
                <button id="expand-stats-btn" class="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center space-x-2">
                    <span>📈</span>
                    <span>Análisis Detallado</span>
                </button>
            </div>
        `;
        
        // Añadir event listener al botón expandir
        document.getElementById('expand-stats-btn')?.addEventListener('click', openExpandedStats);
        
    } catch (error) {
        console.error('Error cargando estadísticas:', error.message);
        statsContent.innerHTML = '<p class="text-red-400">Error al cargar estadísticas.</p>';
    }
  }
  
  function getAccuracyColor(accuracy) {
    if (accuracy >= 80) return 'bg-green-500';
    if (accuracy >= 60) return 'bg-yellow-500';
    if (accuracy >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  }
  
  function calculatePlayStreak(playDates) {
    if (playDates.length === 0) return 0;
    
    playDates.sort((a, b) => new Date(b) - new Date(a));
    let streak = 1;
    let currentDate = new Date(playDates[0]);
    
    for (let i = 1; i < playDates.length; i++) {
        const prevDate = new Date(playDates[i]);
        const dayDiff = Math.floor((currentDate - prevDate) / (1000 * 60 * 60 * 24));
        
        if (dayDiff === 1) {
            streak++;
            currentDate = prevDate;
        } else {
            break;
        }
    }
    
    return streak;
  }
  
  async function openExpandedStats() {
    try {
        // Ocultar el panel de juego
        const gameUiContainer = document.getElementById('game-ui-container');
        gameUiContainer.style.opacity = '0.3';
        gameUiContainer.style.pointerEvents = 'none';
        
        const modal = document.getElementById('expanded-stats-modal');
        const content = document.getElementById('expanded-stats-content');
        
        content.innerHTML = '<div class="text-center"><p>Cargando estadísticas detalladas...</p></div>';
        modal.classList.remove('hidden');
        
        // Cargar datos completos
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        
        const { data: stats, error } = await supabaseClient.from('game_stats')
            .select('correct_guesses, total_questions, created_at')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        // Generar el contenido completo
        content.innerHTML = generateExpandedStatsContent(stats);
        
        // Añadir event listeners
        setupExpandedStatsListeners();
        
    } catch (error) {
        console.error('Error cargando estadísticas expandidas:', error);
        document.getElementById('expanded-stats-content').innerHTML = 
            '<p class="text-red-400 text-center">Error al cargar las estadísticas detalladas</p>';
    }
  }
  
  function generateExpandedStatsContent(stats) {
    if (stats.length === 0) {
        return `
            <div class="text-center space-y-6">
                <div class="text-8xl">📈</div>
                <h3 class="text-2xl font-bold">¡Tus estadísticas te esperan!</h3>
                <p class="text-gray-300">Juega algunas partidas para ver tu progreso aquí</p>
            </div>
        `;
    }
    
    // Calcular estadísticas avanzadas usando solo columnas existentes
    const totalGames = stats.length;
    const totalCorrect = stats.reduce((sum, game) => sum + game.correct_guesses, 0);
    const totalPlayed = stats.reduce((sum, game) => sum + game.total_questions, 0);
    const averageAccuracy = totalPlayed > 0 ? Math.round((totalCorrect / totalPlayed) * 100) : 0;
    
    // Añadir accuracy_percentage calculado a cada juego
    const gamesWithAccuracy = stats.map(game => ({
        ...game,
        accuracy_percentage: game.total_questions > 0 ? Math.round((game.correct_guesses / game.total_questions) * 100) : 0,
        duration_seconds: 0, // Por ahora no tenemos esta columna
        max_streak: 0, // Por ahora no tenemos esta columna
        game_mode: 'classic' // Por ahora no tenemos esta columna
    }));
    
    const bestGame = gamesWithAccuracy.reduce((best, game) => 
        game.accuracy_percentage > best.accuracy_percentage ? game : best, gamesWithAccuracy[0] || {accuracy_percentage: 0});
    const totalPlayTime = 0; // No tenemos duración por ahora
    
    // Estadísticas por modo (solo clásico por ahora)
    const modeBreakdown = {
        'classic': {
            count: totalGames,
            accuracy: averageAccuracy,
            totalCorrect: totalCorrect,
            totalPlayed: totalPlayed
        }
    };
    
    const modeNames = {
        'classic': '🎯 Clásico',
        'revancha': '🔄 Revancha', 
        'instinto': '🧠 Instinto'
    };
    
    // Historial de partidas (últimas 20)
    const recentGames = gamesWithAccuracy.slice(0, 20);
    
    return `
        <div class="space-y-6">
            <!-- Resumen general -->
            <div class="stats-section">
                <h3 class="stats-section-title">🏆 Resumen General</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="text-center">
                        <div class="text-3xl font-bold text-blue-400">${totalGames}</div>
                        <div class="text-sm text-gray-400">Partidas totales</div>
                    </div>
                    <div class="text-center">
                        <div class="text-3xl font-bold text-green-400">${averageAccuracy}%</div>
                        <div class="text-sm text-gray-400">Precisión media</div>
                    </div>
                    <div class="text-center">
                        <div class="text-3xl font-bold text-purple-400">${totalCorrect}</div>
                        <div class="text-sm text-gray-400">Total aciertos</div>
                    </div>
                    <div class="text-center">
                        <div class="text-3xl font-bold text-yellow-400">${bestGame.accuracy_percentage || 0}%</div>
                        <div class="text-sm text-gray-400">Mejor partida</div>
                    </div>
                </div>
            </div>
            
            <!-- Estadísticas por modo -->
            <div class="stats-section">
                <h3 class="stats-section-title">🎮 Por Modo de Juego</h3>
                <div class="space-y-3">
                    ${Object.entries(modeBreakdown).map(([mode, data]) => `
                        <div class="flex justify-between items-center p-3 bg-gray-800/50 rounded-lg">
                            <div class="flex items-center space-x-3">
                                <span class="text-lg">${modeNames[mode] || mode}</span>
                                <span class="text-sm text-gray-400">${data.count} partidas</span>
                            </div>
                            <div class="flex items-center space-x-4">
                                <span class="text-lg font-bold" style="color: ${getAccuracyTextColor(data.accuracy)}">${data.accuracy}%</span>
                                <span class="text-sm text-gray-400">${data.totalCorrect}/${data.totalPlayed}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Historial de partidas -->
            <div class="stats-section">
                <h3 class="stats-section-title">📋 Historial de Partidas</h3>
                <div class="space-y-2 max-h-96 overflow-y-auto">
                    ${recentGames.map((game, index) => {
                        const date = new Date(game.created_at);
                        const timeAgo = getTimeAgo(date);
                        return `
                            <div class="game-history-item">
                                <div class="flex items-center space-x-4 flex-1">
                                    <div class="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold" 
                                         style="background-color: ${getAccuracyBackgroundColor(game.accuracy_percentage || 0)}">
                                        ${game.accuracy_percentage || 0}%
                                    </div>
                                    <div class="flex-1">
                                        <div class="flex items-center space-x-2 mb-1">
                                            <span class="font-semibold">${modeNames[game.game_mode] || game.game_mode}</span>
                                            <span class="text-xs bg-gray-700 px-2 py-1 rounded">${timeAgo}</span>
                                        </div>
                                        <div class="text-sm text-gray-400">
                                            ${game.correct_guesses}/${game.total_questions} calles acertadas
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <!-- Mapa de Calor -->
            <div class="stats-section">
                <h3 class="stats-section-title">🗺️ Análisis Geográfico</h3>
                
                <!-- Controles del mapa de calor -->
                <div class="mb-4 flex space-x-2">
                    <button id="heatmap-global-btn" class="heatmap-control-btn active">
                        <span class="text-lg">🌍</span>
                        <span>Vista Global</span>
                        <small>Dificultad de la ciudad</small>
                    </button>
                    <button id="heatmap-personal-btn" class="heatmap-control-btn">
                        <span class="text-lg">👤</span>
                        <span>Vista Personal</span>
                        <small>Tu progreso</small>
                    </button>
                </div>
                
                <!-- Contenedor del mapa -->
                <div class="relative">
                    <div id="heatmap-container" class="w-full h-80 bg-gray-800/50 rounded-lg border border-gray-700/40 overflow-hidden">
                        <div class="flex items-center justify-center h-full">
                            <div class="text-center space-y-2">
                                <div class="text-2xl">🗺️</div>
                                <p class="text-gray-400">Cargando mapa de calor...</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Botón expandir mapa -->
                    <button id="expand-heatmap-btn" class="absolute top-2 right-2 bg-gray-800/80 hover:bg-gray-700/80 text-white p-2 rounded-lg transition-colors backdrop-blur-sm border border-gray-600/30" title="Expandir mapa">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15,3 21,3 21,9"></polyline>
                            <polyline points="9,21 3,21 3,15"></polyline>
                            <line x1="21" y1="3" x2="14" y2="10"></line>
                            <line x1="3" y1="21" x2="10" y2="14"></line>
                        </svg>
                    </button>
                </div>
                    
                    <!-- Leyenda -->
                    <div class="mt-3 flex items-center justify-center space-x-6 text-sm">
                        <div class="flex items-center space-x-2">
                            <div class="w-4 h-4 bg-red-500 rounded-full"></div>
                            <span class="text-gray-300" id="heatmap-red-label">Zonas difíciles</span>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="w-4 h-4 bg-yellow-500 rounded-full"></div>
                            <span class="text-gray-300">Intermedias</span>
                        </div>
                        <div class="flex items-center space-x-2">
                            <div class="w-4 h-4 bg-green-500 rounded-full"></div>
                            <span class="text-gray-300" id="heatmap-green-label">Zonas fáciles</span>
                        </div>
                    </div>
                </div>
                
                <!-- Información adicional -->
                <div class="mt-4 p-3 bg-gray-800/30 rounded-lg border border-gray-700/30">
                    <p class="text-sm text-gray-400" id="heatmap-description">
                        <strong>Vista Global:</strong> Muestra las zonas más y menos falladas por toda la comunidad. 
                        Ideal para principiantes que buscan empezar por zonas más fáciles.
                    </p>
                </div>
            </div>
            
            <!-- Próximamente -->
            <div class="stats-section">
                <h3 class="stats-section-title">🚀 Próximamente</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="p-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-lg border border-purple-500/30">
                        <div class="text-lg font-bold mb-2">🏅 Logros</div>
                        <div class="text-sm text-gray-300">Sistema de insignias y desafíos</div>
                    </div>
                    <div class="p-4 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-lg border border-blue-500/30">
                        <div class="text-lg font-bold mb-2">📊 Comparativas</div>
                        <div class="text-sm text-gray-300">Compárate con otros usuarios</div>
                    </div>
                </div>
            </div>
        </div>
    `;
  }
  
  function getAccuracyTextColor(accuracy) {
    if (accuracy >= 80) return '#10b981';
    if (accuracy >= 60) return '#f59e0b';
    if (accuracy >= 40) return '#f97316';
    return '#ef4444';
  }
  
  function getAccuracyBackgroundColor(accuracy) {
    if (accuracy >= 80) return 'rgba(16, 185, 129, 0.2)';
    if (accuracy >= 60) return 'rgba(245, 158, 11, 0.2)';
    if (accuracy >= 40) return 'rgba(249, 115, 22, 0.2)';
    return 'rgba(239, 68, 68, 0.2)';
  }
  
  function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 60) return `${diffMins}min`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  }
  
  function setupExpandedStatsListeners() {
    const modal = document.getElementById('expanded-stats-modal');
    const closeBtn = document.getElementById('close-expanded-stats');
    const backdrop = document.getElementById('stats-backdrop');
    const gameUiContainer = document.getElementById('game-ui-container');
    
    const closeModal = () => {
        modal.classList.add('hidden');
        gameUiContainer.style.opacity = '1';
        gameUiContainer.style.pointerEvents = 'auto';
        // Limpiar mapa de calor al cerrar
        clearHeatmap();
    };
    
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    
    // Cerrar con ESC
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
    
    // Configurar controles del mapa de calor
    setupHeatmapControls();
  }
  
  function setupHeatmapControls() {
    const globalBtn = document.getElementById('heatmap-global-btn');
    const personalBtn = document.getElementById('heatmap-personal-btn');
    const redLabel = document.getElementById('heatmap-red-label');
    const greenLabel = document.getElementById('heatmap-green-label');
    const description = document.getElementById('heatmap-description');
    const expandBtn = document.getElementById('expand-heatmap-btn');
    
    if (globalBtn) {
        globalBtn.addEventListener('click', () => {
            toggleHeatmapView('global');
            redLabel.textContent = 'Zonas difíciles';
            greenLabel.textContent = 'Zonas fáciles';
            description.innerHTML = `<strong>Vista Global:</strong> Muestra las zonas más y menos falladas por toda la comunidad. 
                                    Ideal para principiantes que buscan empezar por zonas más fáciles.`;
        });
    }
    
    if (personalBtn) {
        personalBtn.addEventListener('click', () => {
            toggleHeatmapView('personal');
            redLabel.textContent = 'Necesitas repasar';
            greenLabel.textContent = 'Zonas dominadas';
            description.innerHTML = `<strong>Vista Personal:</strong> Tu progreso personal. Las zonas rojas necesitan más práctica, 
                                    las verdes están bien controladas. Solo aparecen zonas que has jugado.`;
        });
    }
    
    if (expandBtn) {
        expandBtn.addEventListener('click', openExpandedHeatmapModal);
    }
    
    // Inicializar mapa de calor con vista global
    initializeHeatmap();
  }
  
  // === MODAL DE MAPA EXPANDIDO ===
  async function openExpandedHeatmapModal() {
    const modal = document.getElementById('expanded-heatmap-modal');
    const container = document.getElementById('expanded-heatmap-container');
    
    modal.classList.remove('hidden');
    
    try {
        // Crear mapa expandido con zoom completo
        container.innerHTML = '<div id="expanded-heatmap-leaflet" style="width: 100%; height: 100%;"></div>';
        
        const expandedMap = L.map('expanded-heatmap-leaflet', {
            center: [38.8794, -6.9706],
            zoom: 12,
            zoomControl: true,
            scrollWheelZoom: true,
            doubleClickZoom: true,
            dragging: true
        });
        
        // Mismo estilo de mapa que el juego
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '© OSM & CARTO',
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(expandedMap);
        
        // Cargar datos del mapa de calor
        const heatmapData = await fetchHeatmapData(currentHeatmapType);
        renderHeatmap(heatmapData, expandedMap);
        
        // Configurar controles mini
        setupExpandedHeatmapControls(expandedMap);
        
        // Guardar referencia
        window.expandedHeatmapMap = expandedMap;
        
        // Forzar resize del mapa tras un momento
        setTimeout(() => expandedMap.invalidateSize(), 200);
        
    } catch (error) {
        console.error('Error creando mapa expandido:', error);
        container.innerHTML = '<div class="flex items-center justify-center h-full text-gray-400">Error al cargar mapa expandido</div>';
    }
  }
  
  function setupExpandedHeatmapControls(mapInstance) {
    const miniGlobalBtn = document.getElementById('mini-global-btn');
    const miniPersonalBtn = document.getElementById('mini-personal-btn');
    const closeBtn = document.getElementById('close-expanded-heatmap');
    const backdrop = document.getElementById('heatmap-backdrop');
    const modal = document.getElementById('expanded-heatmap-modal');
    
    const closeModal = () => {
        modal.classList.add('hidden');
        if (window.expandedHeatmapMap) {
            window.expandedHeatmapMap.remove();
            window.expandedHeatmapMap = null;
        }
    };
    
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    
    // Controles de tipo de vista
    miniGlobalBtn.addEventListener('click', async () => {
        if (currentHeatmapType === 'global') return;
        
        currentHeatmapType = 'global';
        miniGlobalBtn.classList.add('bg-blue-600', 'text-white', 'active');
        miniGlobalBtn.classList.remove('bg-gray-700', 'text-gray-300');
        miniPersonalBtn.classList.add('bg-gray-700', 'text-gray-300');
        miniPersonalBtn.classList.remove('bg-blue-600', 'text-white', 'active');
        
        const heatmapData = await fetchHeatmapData('global');
        renderHeatmap(heatmapData, mapInstance);
    });
    
    miniPersonalBtn.addEventListener('click', async () => {
        if (currentHeatmapType === 'personal') return;
        
        currentHeatmapType = 'personal';
        miniPersonalBtn.classList.add('bg-blue-600', 'text-white', 'active');
        miniPersonalBtn.classList.remove('bg-gray-700', 'text-gray-300');
        miniGlobalBtn.classList.add('bg-gray-700', 'text-gray-300');
        miniGlobalBtn.classList.remove('bg-blue-600', 'text-white', 'active');
        
        const heatmapData = await fetchHeatmapData('personal');
        renderHeatmap(heatmapData, mapInstance);
    });
  }
  
  async function initializeHeatmap() {
    const container = document.getElementById('heatmap-container');
    if (!container) return;
    
    try {
        // Crear un mini mapa para el mapa de calor
        container.innerHTML = '<div id="heatmap-mini-map" style="width: 100%; height: 100%;"></div>';
        
        const miniMap = L.map('heatmap-mini-map', {
            center: [38.8794, -6.9706], // Centro de Badajoz
            zoom: 13,
            zoomControl: false,
            dragging: true,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false
        });
        
        // Añadir tiles del mapa (mismo estilo que el juego)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '',
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(miniMap);
        
        // Cargar y renderizar datos iniciales (global)
        const heatmapData = await fetchHeatmapData('global');
        renderHeatmap(heatmapData, miniMap);
        
        // Guardar referencia al mini mapa
        window.heatmapMiniMap = miniMap;
        
    } catch (error) {
        console.error('Error inicializando mapa de calor:', error);
        container.innerHTML = `
            <div class="flex items-center justify-center h-full">
                <div class="text-center space-y-2">
                    <div class="text-xl">⚠️</div>
                    <p class="text-gray-400">Error cargando mapa de calor</p>
                </div>
            </div>
        `;
    }
  }

  // ===============================
  // SISTEMA DE MAPA DE CALOR
  // ===============================
  
  let heatmapLayer = null;
  let currentHeatmapType = 'global'; // 'global' o 'personal'
  
  /**
   * Obtener datos del mapa de calor desde la API
   */
  async function fetchHeatmapData(type = 'global') {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const params = new URLSearchParams({ 
            action: 'heatmap',
            type: type
        });
        
        if (type === 'personal' && session) {
            params.append('user_id', session.user.id);
        }
        
        const response = await fetch(`/api/geocode?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching heatmap data:', error);
        // Fallback a datos simulados
        return generateFallbackHeatmapData(type);
    }
  }
  
  /**
   * Generar datos simulados como fallback
   */
  function generateFallbackHeatmapData(type) {
    const zones = [
        { lat: 38.8794, lng: -6.9706, name: "Centro Histórico" },
        { lat: 38.8850, lng: -6.9650, name: "San Roque" },
        { lat: 38.8750, lng: -6.9800, name: "Cerro de Reyes" },
        { lat: 38.8700, lng: -6.9600, name: "Valdepasillas" },
        { lat: 38.8900, lng: -6.9500, name: "Pardaleras" }
    ];
    
    return {
        type: type,
        data: zones.map(zone => ({
            ...zone,
            accuracy: Math.random(),
            gamesCount: Math.floor(Math.random() * 10) + 1,
            color: getHeatmapColor(Math.random(), type),
            opacity: 0.6
        })),
        totalGames: 25
    };
  }
  
  /**
   * Renderizar mapa de calor en el mapa de juego
   */
  function renderHeatmap(heatmapData, mapInstance = null) {
    const targetMap = mapInstance || gameMap;
    if (!targetMap) return;
    
    // Limpiar capa anterior
    if (heatmapLayer) {
        targetMap.removeLayer(heatmapLayer);
    }
    
    // Crear nueva capa de grupo
    heatmapLayer = L.layerGroup();
    
    heatmapData.data.forEach((zone, index) => {
        if (zone.polygon && currentHeatmapType === 'personal') {
            // Renderizar polígono real para datos personales
            const polygonLatLngs = zone.polygon.map(point => [point[0], point[1]]);
            
            // Crear múltiples capas de polígono para efecto difuminado
            for (let i = 0; i < 4; i++) {
                const bufferSize = i * 100; // Buffer en metros para cada capa
                const opacityMultiplier = 1 - (i * 0.25); // 1, 0.75, 0.5, 0.25
                
                // Crear polígono con buffer simulado (expandido)
                const bufferedPolygon = expandPolygon(polygonLatLngs, bufferSize);
                
                const polygon = L.polygon(bufferedPolygon, {
                    fillColor: zone.color,
                    color: zone.color,
                    weight: i === 0 ? 1 : 0,
                    fillOpacity: (zone.opacity || 0.6) * opacityMultiplier,
                    className: `heatmap-polygon heatmap-layer-${i}`
                });
                
                // Solo añadir tooltip al polígono principal
                if (i === 0) {
                    const tooltipContent = `<strong>${zone.name || 'Tu zona'}</strong><br/>
                           ${Math.round(zone.accuracy * 100)}% de precisión<br/>
                           ${zone.totalCorrect}/${zone.totalAttempts} aciertos<br/>
                           ${zone.gameDate ? new Date(zone.gameDate).toLocaleDateString() : ''}`;
                           
                    polygon.bindTooltip(tooltipContent, {
                        sticky: true,
                        direction: 'top',
                        className: 'heatmap-tooltip'
                    });
                }
                
                heatmapLayer.addLayer(polygon);
            }
        } else {
            // Sistema de múltiples círculos para datos globales o fallback
            const baseRadius = 600;
            const circles = [];
            
            // Crear múltiples círculos concéntricos para difuminado suave
            for (let i = 0; i < 4; i++) {
                const radiusMultiplier = 1 + (i * 0.3); // 1x, 1.3x, 1.6x, 1.9x
                const opacityMultiplier = 1 - (i * 0.25); // 1, 0.75, 0.5, 0.25
                
                const circle = L.circle([zone.lat, zone.lng], {
                    radius: baseRadius * radiusMultiplier,
                    fillColor: zone.color,
                    color: zone.color,
                    weight: 0,
                    fillOpacity: (zone.opacity || 0.6) * opacityMultiplier,
                    className: `heatmap-zone heatmap-layer-${i}`
                });
                
                // Solo añadir tooltip al círculo central
                if (i === 0) {
                    const tooltipContent = currentHeatmapType === 'global' 
                        ? `<strong>${zone.name || 'Zona'}</strong><br/>
                           ${Math.round(zone.accuracy * 100)}% de éxito<br/>
                           ${zone.gamesPlayed || 0} partidas jugadas`
                        : `<strong>${zone.name || 'Tu zona'}</strong><br/>
                           ${Math.round(zone.accuracy * 100)}% de precisión<br/>
                           ${zone.gamesCount} partidas<br/>
                           ${zone.totalCorrect}/${zone.totalAttempts} aciertos`;
                           
                    circle.bindTooltip(tooltipContent, {
                        sticky: true,
                        direction: 'top',
                        className: 'heatmap-tooltip'
                    });
                }
                
                circles.push(circle);
                heatmapLayer.addLayer(circle);
            }
        }
        
        // Añadir animación de entrada escalonada
        setTimeout(() => {
            circles.forEach((circle, circleIndex) => {
                const element = circle.getElement();
                if (element) {
                    element.style.transition = 'all 0.8s ease-out';
                    element.style.transform = 'scale(1)';
                    element.style.opacity = circle.options.fillOpacity;
                }
            });
        }, index * 150); // Delay progresivo por zona
    });
    
    // Añadir al mapa
    heatmapLayer.addTo(targetMap);
    
    // Aplicar estilos CSS para difuminado
    setTimeout(() => {
        document.querySelectorAll('.heatmap-zone').forEach(element => {
            element.style.filter = 'blur(20px)';
            element.style.transition = 'all 0.3s ease';
        });
    }, 100);
  }
  
  /**
   * Alternar entre vista global y personal
   */
  async function toggleHeatmapView(newType) {
    if (currentHeatmapType === newType) return;
    
    currentHeatmapType = newType;
    const heatmapData = await fetchHeatmapData(newType);
    
    // Usar el mini mapa si existe, sino el mapa principal
    const targetMap = window.heatmapMiniMap || gameMap;
    renderHeatmap(heatmapData, targetMap);
    
    // Actualizar controles UI
    updateHeatmapControls(newType);
  }
  
  /**
   * Actualizar controles de interfaz
   */
  function updateHeatmapControls(type) {
    const globalBtn = document.getElementById('heatmap-global-btn');
    const personalBtn = document.getElementById('heatmap-personal-btn');
    
    if (globalBtn && personalBtn) {
        globalBtn.classList.toggle('active', type === 'global');
        personalBtn.classList.toggle('active', type === 'personal');
    }
  }
  
  /**
   * Expandir polígono para crear efecto difuminado
   */
  function expandPolygon(coordinates, bufferMeters) {
    if (bufferMeters === 0) return coordinates;
    
    // Calcular centroide del polígono
    let centerLat = 0, centerLng = 0;
    coordinates.forEach(coord => {
        centerLat += coord[0];
        centerLng += coord[1];
    });
    centerLat /= coordinates.length;
    centerLng /= coordinates.length;
    
    // Expandir cada punto alejándolo del centro
    return coordinates.map(coord => {
        const deltaLat = coord[0] - centerLat;
        const deltaLng = coord[1] - centerLng;
        
        // Factor de expansión basado en el buffer (aproximadamente 100m = 0.001 grados)
        const expansionFactor = 1 + (bufferMeters * 0.00001);
        
        return [
            centerLat + (deltaLat * expansionFactor),
            centerLng + (deltaLng * expansionFactor)
        ];
    });
  }

  /**
   * Limpiar mapa de calor
   */
  function clearHeatmap() {
    if (heatmapLayer && gameMap) {
        gameMap.removeLayer(heatmapLayer);
        heatmapLayer = null;
    }
  }
  
  function getHeatmapColor(accuracy, type = 'global') {
    if (type === 'global') {
        // Global: rojo = difícil, verde = fácil
        if (accuracy >= 0.8) return '#10b981'; // Verde
        if (accuracy >= 0.6) return '#f59e0b'; // Amarillo
        return '#ef4444'; // Rojo
    } else {
        // Personal: verde = dominado, rojo = necesita repaso
        if (accuracy >= 0.8) return '#10b981'; // Verde
        if (accuracy >= 0.6) return '#f59e0b'; // Amarillo  
        return '#ef4444'; // Rojo
    }
  }

  uiElements.googleLoginBtn.addEventListener('click', signInWithGoogle);
  
  // Event listeners para autenticación por email
  uiElements.emailAuthForm.addEventListener('submit', (e) => {
    e.preventDefault();
    signInWithEmail();
  });
  
  uiElements.loginBtn.addEventListener('click', signInWithEmail);
  uiElements.registerBtn.addEventListener('click', signUpWithEmail);
  
  supabaseClient.auth.onAuthStateChange(handleAuthStateChange);
});