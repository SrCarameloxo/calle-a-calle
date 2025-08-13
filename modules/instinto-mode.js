// Fichero: modules/instinto-mode.js

/**
 * Esta será la función principal que tomará el control
 * cuando el usuario active el Modo Instinto.
 * @param {object} context - Un objeto con las herramientas de main.js.
 * @param {object} context.ui - Referencias a los elementos del DOM.
 * @param {object} context.gameMap - La instancia del mapa de Leaflet.
 * @param {function} context.updatePanelUI - La función para animar el panel de UI.
 */
export function startInstintoGame({ ui, gameMap, updatePanelUI }) {
  console.log("¡El Modo Instinto ha sido activado! La lógica está ahora en instinto-mode.js");

  // --- Estado y constantes locales del MODO INSTINTO ---
  const COL_ZONE = '#663399';
  let drawing = false;
  let zonePoly = null;
  let tempMarkers = [];
  let zonePoints = [];
  let streetList = [];
  let totalQuestions = 0;

  // --- Lógica Principal de Activación ---
  ui.drawZoneBtn.classList.remove('hidden');
  ui.drawZoneBtn.addEventListener('click', initializeDrawingProcess);


  // --- Funciones de Lógica de Juego (copiadas y adaptadas de main.js) ---

  function clearMapLayers(clearFull = false) {
    if (zonePoly) gameMap.removeLayer(zonePoly);
    tempMarkers.forEach(m => gameMap.removeLayer(m));
    zonePoly = null;
    tempMarkers = [];

    if (clearFull) {
        zonePoints = [];
        if (drawing) {
            gameMap.off('click', addVertex);
            drawing = false;
        }
    }
  }

  function initializeDrawingProcess() {
    // Este listener se elimina a sí mismo para evitar duplicados
    ui.drawZoneBtn.removeEventListener('click', initializeDrawingProcess);

    updatePanelUI(() => {
        ui.drawZoneBtn.classList.add('hidden');
        ui.startOptions.classList.remove('hidden');
        ui.undoPointBtn.classList.remove('hidden');
        ui.startBtn.disabled = true;
        ui.startBtn.textContent = 'Start';
        ui.includePOICheckbox.checked = false; // El modo instinto no usa POIs
        ui.includePOICheckbox.disabled = true;
    });

    clearMapLayers(true);
    drawing = true;

    // Configurar el botón de Start para este modo
    setupInstintoStartButton(ui.startBtn);
    
    // Listeners para el dibujo
    ui.undoPointBtn.addEventListener('click', undoLastPoint);
    gameMap.on('click', addVertex);
  }

  function addVertex(e) {
    if (!drawing) return;
    const { latlng } = e;
    
    if (zonePoints.length >= 3 && latlng.equals(zonePoints[0])) {
      finishPolygon();
      return;
    }
    
    const mk = L.circleMarker(latlng, { radius: 5, color: COL_ZONE }).addTo(gameMap);
    tempMarkers.push(mk);
    zonePoints.push(latlng);
    
    if (zonePoly) gameMap.removeLayer(zonePoly);
    zonePoly = L.polygon(zonePoints, { color: COL_ZONE, weight: 2, fillOpacity: 0.1 }).addTo(gameMap);
    
    if (zonePoints.length >= 3 && ui.startBtn.disabled) {
        updatePanelUI(() => { ui.startBtn.disabled = false; });
    }
  }

  function finishPolygon() {
    if (!drawing) return;
    updatePanelUI(() => {
        drawing = false;
        gameMap.off('click', addVertex);
        tempMarkers.forEach(m => gameMap.removeLayer(m));
        tempMarkers = [];
        zonePoly.addLatLng(zonePoints[0]);
        ui.undoPointBtn.classList.add('hidden');
        ui.startBtn.disabled = false;
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
        
        if (zonePoints.length < 3) ui.startBtn.disabled = true;
    });
  }

  function setupInstintoStartButton(bStart) {
    const handleStartClick = async () => {
        bStart.removeEventListener('click', handleStartClick); // Evitar doble click
        
        updatePanelUI(() => ui.startOptions.classList.add('hidden'));
        if (!zonePoly) return;

        if (drawing) {
            drawing = false;
            gameMap.off('click', addVertex);
            ui.undoPointBtn.removeEventListener('click', undoLastPoint);
            tempMarkers.forEach(m => gameMap.removeLayer(m));
            tempMarkers = [];
        }

        await preloadStreets();

        if (totalQuestions >= 4) {
            console.log(`Zona definida en Modo Instinto con ${totalQuestions} calles. Listo para generar preguntas.`, streetList);
            // PRÓXIMO PASO: Aquí llamaremos a la función que inicia el juego de verdad.
        } else {
            alert('La zona seleccionada no contiene suficientes calles. El Modo Instinto requiere al menos 4 calles distintas. Por favor, dibuja una zona más grande.');
            // Devolvemos la UI al estado inicial del modo
            ui.drawZoneBtn.classList.remove('hidden');
            ui.drawZoneBtn.addEventListener('click', initializeDrawingProcess);
            clearMapLayers(true);
        }
    };
    bStart.addEventListener('click', handleStartClick);
  }

  async function preloadStreets() {
      ui.loaderContainer.classList.remove('hidden');
      try {
          const zoneParam = zonePoints.map(p => `${p.lat},${p.lng}`).join(';');
          // Forzamos includePOI a false para el modo instinto
          const response = await fetch(`/api/getStreets?zone=${encodeURIComponent(zoneParam)}&includePOI=false`);
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
          streetList = [];
          totalQuestions = 0;
      } finally {
          ui.loaderContainer.classList.add('hidden');
      }
  }
}