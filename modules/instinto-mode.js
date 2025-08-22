// Fichero: modules/instinto-mode.js

/**
 * Esta será la función principal que tomará el control
 * cuando el usuario active el Modo Instinto.
 * @param {object} context - Un objeto con las herramientas de main.js.
 * @param {object} context.ui - Referencias a los elementos del DOM.
 * @param {object} context.gameMap - La instancia del mapa de Leaflet.
 * @param {function} context.updatePanelUI - La función para animar el panel de UI.
 * @returns {object} Un objeto con funciones para controlar el modo desde fuera.
 */
export function startInstintoGame({ ui, gameMap, updatePanelUI, userProfile, setReportContext }) {
  console.log("¡El Modo Instinto ha sido activado! La lógica está ahora en instinto-mode.js");

  // --- Estado y constantes locales del MODO INSTINTO ---
  const COL_ZONE = '#663399';
  const COL_NEUTRAL = '#0496FF'; // Azul eléctrico
  const COL_CORRECT = '#007a2f';
  const COL_INCORRECT = '#FF0033';
  let drawing = false;
  let zonePoly = null;
  let tempMarkers = [];
  let zonePoints = [];
  let streetList = [];
  let gameQuestions = [];
  let currentQuestionIndex = 0;
  let score = 0;
  let streetLayerGroup = null;
  let listeners = []; // Para guardar y limpiar los listeners

  // --- Lógica Principal de Activación ---
  
  function addManagedListener(element, event, handler) {
    element.addEventListener(event, handler);
    listeners.push({ element, event, handler });
  }

  function clearAllListeners() {
    listeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    listeners = [];
    gameMap.off('click', addVertex); // Limpiar listener del mapa explícitamente
  }

  // La limpieza inteligente se mantiene, es la correcta para el polígono.
  function clearMapLayers(clearFull = false) {
    if (streetLayerGroup) gameMap.removeLayer(streetLayerGroup);
    streetLayerGroup = null;

    if (clearFull) {
        if (zonePoly) gameMap.removeLayer(zonePoly);
        tempMarkers.forEach(m => gameMap.removeLayer(m));
        zonePoly = null;
        tempMarkers = [];
        zonePoints = [];
        if (drawing) {
            gameMap.off('click', addVertex);
            drawing = false;
        }
    }
  }

  function initializeDrawingProcess() {
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
    
    addManagedListener(ui.startBtn, 'click', handleStartClick);
    addManagedListener(ui.undoPointBtn, 'click', undoLastPoint);
    gameMap.on('click', addVertex);
  }
  
  function handleStartClick() {
      setupInstintoStartButton();
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
    clearAllListeners();
    updatePanelUI(() => ui.startOptions.classList.add('hidden'));
    if (!zonePoly) return;
    if (drawing) {
        drawing = false;
        gameMap.off('click', addVertex);
        tempMarkers.forEach(m => gameMap.removeLayer(m));
        tempMarkers = [];
    }
    await preloadStreets();
    // --- INICIO DE LA MODIFICACIÓN: Filtro de seguridad ---
    // Añadimos un filtro para eliminar calles sin geometría antes de generar preguntas.
    const validStreetList = streetList.filter(street => street.geometries && street.geometries.length > 0);

    if (validStreetList.length >= 4) {
        gameQuestions = generateQuestions(validStreetList);
        // --- FIN DE LA MODIFICACIÓN ---
        startGameFlow(gameQuestions);
    } else {
        alert('La zona seleccionada no contiene suficientes calles. El Modo Instinto requiere al menos 4 calles distintas. Por favor, dibuja una zona más grande.');
        ui.drawZoneBtn.classList.remove('hidden');
        addManagedListener(ui.drawZoneBtn, 'click', initializeDrawingProcess);
        clearMapLayers(true);
    }
  }

  function generateQuestions(allStreets) {
    const shuffledStreets = [...allStreets].sort(() => Math.random() - 0.5);
    const questions = [];
    for (let i = 0; i < shuffledStreets.length; i++) {
        const correctAnswer = shuffledStreets[i];
        const decoys = [];
        const decoyPool = shuffledStreets.filter(s => s.googleName !== correctAnswer.googleName);
        while (decoys.length < 3 && decoyPool.length > 0) {
            const randomIndex = Math.floor(Math.random() * decoyPool.length);
            decoys.push(decoyPool.splice(randomIndex, 1)[0]);
        }
        if (decoys.length < 3) continue;
        const options = [correctAnswer, ...decoys].sort(() => Math.random() - 0.5);
        questions.push({ correctAnswer, options });
    }
    return questions;
  }

  function startGameFlow(questions) {
    currentQuestionIndex = 0;
    score = 0;
    
    // La lógica para el estilo del polígono se mantiene como la pediste.
    if (zonePoly) {
        zonePoly.setStyle({ color: COL_ZONE, weight: 2, dashArray: null, fillOpacity: 0.1 });
    }

    updatePanelUI(() => {
      ui.gameInterface.classList.remove('hidden');
      ui.progressBar.style.width = '0%';
      ui.reportBtnFAB.classList.remove('hidden');
    });
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
    streetLayerGroup = L.layerGroup().addTo(gameMap);
    correctAnswer.geometries.forEach(geom => {
        const layer = geom.isClosed 
            ? L.polygon(geom.points, { color: COL_NEUTRAL, weight: 4, fillOpacity: 0.2 })
            : L.polyline(geom.points, { color: COL_NEUTRAL, weight: 8 });
        layer.addTo(streetLayerGroup);
    });

    // --- CÓDIGO DE ZOOM INTELIGENTE ELIMINADO TEMPORALMENTE PARA RESTAURAR LA FUNCIONALIDAD ---

    setReportContext({
        geometries: correctAnswer.geometries,
        city: userProfile.subscribedCity
    });

    updatePanelUI(() => {
        ui.gameQuestion.textContent = `¿Cómo se llama esta calle?`;
        ui.instintoOptionsContainer.innerHTML = '';
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'game-control-btn';
            btn.textContent = opt.googleName;
            addManagedListener(btn, 'click', () => handleAnswer(opt, correctAnswer, btn));
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
    clearAllListeners();
    const allOptionBtns = ui.instintoOptionsContainer.querySelectorAll('button');
    allOptionBtns.forEach(btn => {
        btn.disabled = true;
    });

    const isCorrect = selectedOption.googleName === correctAnswer.googleName;
    const pulseClass = isCorrect ? 'panel-pulse-correct' : 'panel-pulse-incorrect';

    if (isCorrect) {
        score++;
        clickedButton.style.backgroundColor = '#28a745';
        if (userProfile.settings.enable_sounds) {
            const sound = document.getElementById('correct-sound');
            if(sound) {
                sound.volume = userProfile.settings.sound_volume;
                sound.play().catch(e => {});
            }
        }
        
        streetLayerGroup.eachLayer(layer => {
            const element = layer.getElement();
            if (element) {
                element.classList.add('street-reveal-animation');
            } else {
                layer.setStyle({ color: COL_CORRECT });
            }
        });

    } else {
        clickedButton.style.backgroundColor = '#c82333';
        allOptionBtns.forEach(btn => {
            if (btn.textContent === correctAnswer.googleName) {
                btn.style.backgroundColor = '#28a745';
                btn.style.transform = 'scale(1.03)';
            }
        });
        if (userProfile.settings.enable_sounds) {
            const sound = document.getElementById('incorrect-sound');
            if (sound) {
                sound.volume = userProfile.settings.sound_volume;
                sound.play().catch(e => {});
            }
        }

        streetLayerGroup.eachLayer(layer => {
            const element = layer.getElement();
            if (element) {
                element.classList.add('street-reveal-animation-fail');
            } else {
                layer.setStyle({ color: COL_INCORRECT });
            }
        });
    }
    
    allOptionBtns.forEach(btn => {
        if (btn !== clickedButton && btn.textContent !== correctAnswer.googleName) {
            btn.classList.add('option-disabled');
        }
    });

    if (userProfile.settings.enable_feedback_animation) {
        ui.gameUiContainer.classList.add(pulseClass);
        ui.gameUiContainer.addEventListener('animationend', () => {
            ui.gameUiContainer.classList.remove(pulseClass);
        }, { once: true });
    } else {
        const feedbackColor = isCorrect ? 'rgba(57, 255, 20, 0.6)' : 'rgba(255, 31, 79, 0.6)';
        ui.gameUiContainer.style.boxShadow = `0 0 20px 5px ${feedbackColor}`;
        setTimeout(() => {
            ui.gameUiContainer.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
        }, 800);
    }

    ui.scoreDisplayToggle.textContent = `Puntuación: ${score} / ${currentQuestionIndex}`;
    ui.nextBtn.disabled = false;
  }
  
  function endGame() {
    clearAllListeners();
    setReportContext(null);
    ui.reportBtnFAB.classList.add('hidden');

    if (zonePoly) {
        zonePoly.setStyle({ color: '#696969', weight: 2, dashArray: '5, 5', fillOpacity: 0.05 });
    }

    updatePanelUI(() => {
        ui.gameInterface.classList.add('hidden');
        ui.endGameOptions.classList.remove('hidden');
        ui.finalScoreEl.textContent = `¡Partida terminada! Puntuación: ${score} / ${gameQuestions.length}`;
        ui.reviewGameBtn.classList.add('hidden');
        ui.saveZoneBtn.classList.add('hidden');
        ui.repeatZoneBtn.textContent = 'Repetir Zona (Instinto)';
        ui.repeatZoneBtn.disabled = false;
        const repeatListener = () => {
            ui.endGameOptions.classList.add('hidden');
            startGameFlow(gameQuestions.sort(() => Math.random() - 0.5));
        };
        addManagedListener(ui.repeatZoneBtn, 'click', repeatListener, { once: true });
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

  // --- Punto de Entrada Inicial del Módulo ---
  addManagedListener(ui.drawZoneBtn, 'click', initializeDrawingProcess);
  
  // --- Devolver los Controles del Módulo ---
  // --- INICIO DE LA MODIFICACIÓN ---
  return {
      next: showNextQuestion,
      clear: () => {
        clearAllListeners();
        clearMapLayers(true);
        setReportContext(null);
        ui.reportBtnFAB.classList.add('hidden');
      },
      restart: initializeDrawingProcess
  };
  // --- FIN DE LA MODIFICACIÓN ---
}