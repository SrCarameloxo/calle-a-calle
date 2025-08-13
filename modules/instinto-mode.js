// Fichero: modules/instinto-mode.js

/**
 * Esta será la función principal que tomará el control
 * cuando el usuario active el Modo Instinto.
 * @param {object} context - Un objeto con las herramientas de main.js.
 * @param {object} context.ui - Referencias a los elementos del DOM.
 * @param {object} context.gameMap - La instancia del mapa de Leaflet.
 */
export function startInstintoGame({ ui, gameMap }) {
  console.log("¡El Modo Instinto ha sido activado! La lógica está ahora en instinto-mode.js");
  console.log("Herramientas recibidas:", { ui, gameMap });

  // Ocultamos las opciones que no pertenecen a este modo
  ui.startOptions.classList.add('hidden');
  ui.loadedZoneOptions.classList.add('hidden');
  ui.gameInterface.classList.add('hidden');
  ui.endGameOptions.classList.add('hidden');

  // Mostramos el botón para empezar a dibujar
  ui.drawZoneBtn.classList.remove('hidden');

  // Añadimos el listener específico para este modo
  ui.drawZoneBtn.addEventListener('click', handleStartDrawing);

  function handleStartDrawing() {
    console.log("Botón 'Establecer zona' pulsado desde el MODO INSTINTO.");
    // Aquí implementaremos la lógica de dibujo específica para el modo instinto.
    // Por ahora, solo quitamos el listener para evitar que se acumule si el usuario
    // cambia de modo varias veces.
    ui.drawZoneBtn.removeEventListener('click', handleStartDrawing);
  }
}