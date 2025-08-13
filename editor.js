// --- editor.js (Versión 3 - Con Geoman y Panel de Edición Básico) ---

document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURACIÓN ---
    const SUPABASE_URL = 'https://hppzwfwtedghpsxfonoh.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjQzNDMsImV4cCI6MjA2OTcwMDM0M30.BAh6i5iJ5YkDBoydfkC9azAD4eMdYBkEBdxws9kj5Hg';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- ELEMENTOS DEL DOM ---
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = loadingOverlay.querySelector('p');
    const editPanel = document.getElementById('edit-panel');
    const streetNameInput = document.getElementById('street-name-input');
    const streetIdDisplay = document.getElementById('street-id-display');
    const saveChangesBtn = document.getElementById('save-changes-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    // --- INICIALIZACIÓN DEL MAPA ---
    const map = L.map('editor-map').setView([38.88, -6.97], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© CARTO', maxZoom: 20
    }).addTo(map);
    
    let geojsonLayer; // Variable global para guardar la capa de calles

    // --- INICIALIZACIÓN DE GEOMAN ---
    map.pm.addControls({
      position: 'topleft',
      drawCircle: false,
      drawMarker: false,
      drawCircleMarker: false,
      drawRectangle: false,
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      cutPolygon: true,
      removalMode: true,
    });
    map.pm.setPathOptions({
        color: 'orange', fillColor: 'orange', fillOpacity: 0.4,
    });

    // --- LÓGICA DE EDICIÓN ---
    let selectedLayer = null; // Para saber qué calle estamos editando

    function openEditPanel(layer) {
        selectedLayer = layer;
        const properties = layer.feature.properties;
        const currentName = properties.tags.name || '';
        
        streetNameInput.value = currentName;
        streetIdDisplay.textContent = properties.id;
        editPanel.style.display = 'block';
    }

    function closeEditPanel() {
        editPanel.style.display = 'none';
        selectedLayer = null;
    }

    // Eventos de los botones del panel
    saveChangesBtn.addEventListener('click', async () => {
        if (!selectedLayer) return;

        const newName = streetNameInput.value.trim();
        alert(`Guardar cambios para la calle ${selectedLayer.feature.properties.id} con el nuevo nombre: "${newName}"\n\n(Lógica de guardado en Supabase pendiente)`);
        // Aquí irá la llamada a la API de Supabase para guardar el cambio
        
        // Actualizamos el popup en el mapa al instante
        selectedLayer.bindPopup(`<b>${newName}</b><br>ID: ${selectedLayer.feature.properties.id}`);
        selectedLayer.feature.properties.tags.name = newName;
        
        closeEditPanel();
    });

    cancelBtn.addEventListener('click', closeEditPanel);


    // --- FUNCIÓN DE CARGA PAGINADA ---
    async function cargarCallesPaginado() {
        let currentPage = 1;
        let totalFeaturesCargadas = 0;
        let seguirCargando = true;

        console.log('Iniciando carga paginada de calles...');

        while (seguirCargando) {
            try {
                loadingText.textContent = `Cargando lote ${currentPage}...`;
                const response = await fetch(`/api/getCityStreets?page=${currentPage}`);
                if (!response.ok) throw new Error('Respuesta de API no válida.');
                
                const geojsonData = await response.json();
                const numFeatures = geojsonData.features.length;
                
                if (numFeatures > 0) {
                    totalFeaturesCargadas += numFeatures;
                    
                    if (!geojsonLayer) {
                        // Creamos la capa la primera vez
                        geojsonLayer = L.geoJSON(geojsonData, {
                            style: { color: "#3388ff", weight: 3 },
                            onEachFeature: function(feature, layer) {
                                // Evento de clic en cada calle
                                layer.on('click', () => {
                                    openEditPanel(layer);
                                });

                                const tags = feature.properties.tags;
                                if (tags && tags.name) {
                                    layer.bindPopup(`<b>${tags.name}</b><br>ID: ${feature.properties.id}`);
                                }
                            }
                        }).addTo(map);
                    } else {
                        // Añadimos los nuevos datos a la capa existente
                        geojsonLayer.addData(geojsonData);
                    }
                    currentPage++;
                } else {
                    seguirCargando = false;
                }
            } catch (error) {
                console.error(`Error al cargar el lote ${currentPage}:`, error);
                loadingText.innerHTML = `<p style="color:red;">Error en lote ${currentPage}: ${error.message}</p>`;
                seguirCargando = false;
            }
        }
        
        loadingText.textContent = `¡Carga completada! ${totalFeaturesCargadas} calles en el mapa.`;
        setTimeout(() => loadingOverlay.style.display = 'none', 2000);
    }
    
    // --- LÓGICA DE AUTENTICACIÓN Y ARRANQUE ---
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            if (session) {
                supabase.from('profiles').select('role').eq('id', session.user.id).single()
                    .then(({ data, error }) => {
                        if (error || !data || data.role !== 'admin') {
                            window.location.href = '/';
                        } else {
                            cargarCallesPaginado();
                        }
                    });
            } else {
                window.location.href = '/';
            }
        }
    });
});