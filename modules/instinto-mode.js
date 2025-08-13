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
  const COL_TRACE = '#007a2f';
  let drawing = false;
  let zonePoly = null;
  let tempMarkers = [];
  let zonePoints = [];
  let streetList = [];
  let gameQuestions = [];
  let currentQuestionIndex = 0;
  let score = 0;
  let streetLayerGroup = null;

  // Hacemos que el nuevo contenedor de opciones sea accesible
  ui.instintoOptionsContainer = document.getElementById('instinto-options-container');

  // --- Lógica Principal de Activación ---
  ui.drawZoneBtn.classList.remove('hidden');
  const drawBtnListener = () => initializeDrawingProcess();
  ui.drawZoneBtn.addEventListener('click', drawBtnListener);


  // --- Funciones de Lógica de Juego ---

  function clearMapLayers(clearFull = false) {
    if (streetLayerGroup) gameMap.removeLayer(streetLayerGroup);
    if (zonePoly) gameMap.removeLayer(zonePoly);
    tempMarkers.forEach(m => gameMap.removeLayer(m));
    streetLayerGroup = null;
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
    ui.drawZoneBtn.removeEventListener('click', drawBtnListener);
    updatePanelUI(() => {
        ui.drawZoneBtn.classList.add('hidden');
        ui.startOptions.classList.remove('hidden');
        ui.undoPointBtn.classList.remove('hidden');
        ui.startBtn.disabled = true;
        ui.startBtn.textContent = 'Start';
        ui.includePOICheckbox.checked = false;
        ui.includePOICheckbox.disabled = true;
    });

    clearMapLayers(true);
    drawing = true;
    const startBtnListener = () => setupInstintoStartButton();
    const undoBtnListener = () => undoLastPoint();
    
    ui.startBtn.addEventListener('click', startBtnListener, { once: true });
    ui.undoPointBtn.addEventListener('click', undoBtnListener);
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

  async function setupInstintoStartButton() {
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
    if (streetList.length >= 4) {
        gameQuestions = generateQuestions(streetList);
        startGameFlow(gameQuestions);
    } else {
        alert('La zona seleccionada no contiene suficientes calles. El Modo Instinto requiere al menos 4 calles distintas. Por favor, dibuja una zona más grande.');
        ui.drawZoneBtn.classList.remove('hidden');
        ui.drawZoneBtn.addEventListener('click', drawBtnListener);
        clearMapLayers(true);
    }
  }

  function generateQuestions(allStreets) {
    const shuffledStreets = [...allStreets].sort(() => Math.random() - 0.5);
    const questions = [];

    for (let i = 0; i < shuffledStreets.length; i++) {
        const correctAnswer = shuffledStreets[i];
        const decoys = [];
        
        // Coger otras 3 calles aleatorias como señuelos
        const decoyPool = shuffledStreets.filter(s => s.googleName !== correctAnswer.googleName);
        while (decoys.length < 3 && decoyPool.length > 0) {
            const randomIndex = Math.floor(Math.random() * decoyPool.length);
            decoys.push(decoyPool.splice(randomIndex, 1)[0]);
        }

        // Si no hay suficientes señuelos, esta pregunta no es válida
        if (decoys.length < 3) continue;

        const options = [correctAnswer, ...decoys].sort(() => Math.random() - 0.5);
        questions.push({ correctAnswer, options });
    }
    return questions;
  }

  function startGameFlow(questions) {
    currentQuestionIndex = 0;
    score = 0;
    
    updatePanelUI(() => {
      ui.gameInterface.classList.remove('hidden');
      ui.progressBar.style.width = '0%';
      if(zonePoly) {
          gameMap.fitBounds(zonePoly.getBounds(), {
              paddingTopLeft: [ui.gameUiContainer.offsetWidth + 20, 20],
              paddingBottomRight: [20, 20]
          });
      }
    });

    ui.nextBtn.onclick = () => showNextQuestion();
    showNextQuestion();
  }

  function showNextQuestion() {
    clearMapLayers();

    if (currentQuestionIndex >= gameQuestions.length) {
        endGame();
        return;
    }

    const currentQuestion = gameQuestions[currentQuestionIndex];
    const { correctAnswer, options } = currentQuestion;
    
    // Dibujar la calle de la pregunta
    streetLayerGroup = L.layerGroup().addTo(gameMap);
    correctAnswer.geometries.forEach(geom => {
        const layer = geom.isClosed 
            ? L.polygon(geom.points, { color: COL_TRACE, weight: 4, fillOpacity: 0.2 })
            : L.polyline(geom.points, { color: COL_TRACE, weight: 8 });
        layer.addTo(streetLayerGroup);
    });
    streetLayerGroup.eachLayer(layer => layer.getElement()?.classList.add('street-reveal-animation'));
    
    updatePanelUI(() => {
        ui.gameQuestion.textContent = `¿Cómo se llama esta calle?`;
        ui.instintoOptionsContainer.innerHTML = ''; // Limpiar opciones anteriores
        
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'game-control-btn';
            btn.textContent = opt.googleName;
            btn.onclick = () => handleAnswer(opt, correctAnswer, btn);
            ui.instintoOptionsContainer.appendChild(btn);
        });

        ui.nextBtn.disabled = true;
        ui.scoreDisplayToggle.textContent = `Puntuación: ${score} / ${currentQuestionIndex}`;
        ui.progressCounter.textContent = `${currentQuestionIndex + 1} / ${gameQuestions.length}`;
        ui.progressBar.style.width = `${(currentQuestionIndex / gameQuestions.length) * 100}%`;
    });

    currentQuestionIndex++;
  }

  function handleAnswer(selectedOption, correctAnswer, clickedButton) {
    const allOptionBtns = ui.instintoOptionsContainer.querySelectorAll('button');
    allOptionBtns.forEach(btn => btn.onclick = null); // Desactivar todos los botones

    const isCorrect = selectedOption.googleName === correctAnswer.googleName;
    const soundToPlay = isCorrect ? 'correct-sound' : 'incorrect-sound';
    const pulseClass = isCorrect ? 'panel-pulse-correct' : 'panel-pulse-incorrect';

    if (isCorrect) {
        score++;
        clickedButton.style.backgroundColor = '#28a745'; // Verde
    } else {
        clickedButton.style.backgroundColor = '#c82333'; // Rojo
        // Resaltar la respuesta correcta
        allOptionBtns.forEach(btn => {
            if (btn.textContent === correctAnswer.googleName) {
                btn.style.backgroundColor = '#28a745'; // Verde
                btn.style.transform = 'scale(1.03)';
            }
        });
    }

    document.getElementById(soundToPlay)?.play().catch(e => {});
    ui.gameUiContainer.classList.add(pulseClass);
    ui.gameUiContainer.addEventListener('animationend', () => {
        ui.gameUiContainer.classList.remove(pulseClass);
    }, { once: true });

    ui.scoreDisplayToggle.textContent = `Puntuación: ${score} / ${currentQuestionIndex}`;
    ui.nextBtn.disabled = false;
  }
  
  function endGame() {
    updatePanelUI(() => {
        ui.gameInterface.classList.add('hidden');
        ui.endGameOptions.classList.remove('hidden');
        ui.finalScoreEl.textContent = `¡Partida terminada! Puntuación: ${score} / ${gameQuestions.length}`;
        
        // Ocultar botones no relevantes
        ui.reviewGameBtn.classList.add('hidden');
        ui.saveZoneBtn.classList.add('hidden');

        // Configurar botones de fin de partida
        ui.repeatZoneBtn.textContent = 'Repetir Zona (Instinto)';
        ui.repeatZoneBtn.disabled = false;
        ui.repeatZoneBtn.onclick = () => {
            ui.endGameOptions.classList.add('hidden');
            startGameFlow(gameQuestions.sort(() => Math.random() - 0.5));
        };
        
        ui.backToMenuBtn.classList.remove('hidden');
    });
  }

  async function preloadStreets() {
      ui.loaderContainer.classList.remove('hidden');
      try {
          const zoneParam = zonePoints.map(p => `${p.lat},${p.lng}`).join(';');
          const response = await fetch(`/api/getStreets?zone=${encodeURIComponent(zoneParam)}&includePOI=false`);
          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Error del servidor.');
          }
          const data = await response.json();
          streetList = data.streets;
      } catch (error) {
          console.error(error);
          alert(`Error al cargar las calles: ${error.message}`);
          streetList = [];
      } finally {
          ui.loaderContainer.classList.add('hidden');
      }
  }
}