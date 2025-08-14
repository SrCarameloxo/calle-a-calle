// --- editor.js (Versión 4 - Con Filtrado Visual) ---

document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURACIÓN ---
    const SUPABASE_URL = 'https://hppzwfwtedghpsxfonoh.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjQzNDMsImV4cCI6MjA2OTcwMDM0M30.BAh6i5iJ5YkDBoydfkC9azAD4eMdYBkEBdxws9kj5Hg';
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
    
    let geojsonLayer;

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
    let selectedLayer = null;

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

    saveChangesBtn.addEventListener('click', async () => {
        if (!selectedLayer) return;

        const newName = streetNameInput.value.trim();
        alert(`Guardar cambios para la calle ${selectedLayer.feature.properties.id} con el nuevo nombre: "${newName}"\n\n(Lógica de guardado en Supabase pendiente)`);
        
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

        // Creamos la capa GeoJSON vacía con las reglas de estilo y eventos.
        // La iremos llenando lote a lote.
        geojsonLayer = L.geoJSON(null, { // Empezamos con datos nulos
            style: function(feature) {
                // Estilo condicional:
                const hasName = feature.properties.tags && feature.properties.tags.name;
                return {
                    color: hasName ? "#3388ff" : "#999999",
                    weight: hasName ? 3 : 2,
                    opacity: hasName ? 1.0 : 0.6
                };
            },
            onEachFeature: function(feature, layer) {
                const tags = feature.properties.tags;
                // SOLO añadimos la interactividad si la calle TIENE nombre.
                if (tags && tags.name) {
                    layer.bindPopup(`<b>${tags.name}</b><br>ID: ${feature.properties.id}`);
                    layer.on('click', (e) => {
                        L.DomEvent.stopPropagation(e); // Evita que el clic se propague al mapa
                        openEditPanel(layer);
                    });
                } else {
                    // A las capas sin nombre, no les hacemos nada. No serán clicables.
                    layer.options.interactive = false;
                }
            }
        }).addTo(map);


        while (seguirCargando) {
            try {
                loadingText.textContent = `Cargando lote ${currentPage}...`;
                const response = await fetch(`/api/getCityStreets?page=${currentPage}`);
                if (!response.ok) throw new Error('Respuesta de API no válida.');
                
                const geojsonData = await response.json();
                const numFeatures = geojsonData.features.length;
                
                if (numFeatures > 0) {
                    totalFeaturesCargadas += numFeatures;
                    
                    // En lugar de crear una capa nueva, añadimos los datos a la que ya existe.
                    // La capa aplicará automáticamente el estilo y los eventos que definimos al crearla.
                    geojsonLayer.addData(geojsonData);
                    
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