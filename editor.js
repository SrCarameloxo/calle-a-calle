// --- editor.js (Versión 8.1 - CORRECCIÓN FINAL sobre TU CÓDIGO) ---

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
    
    let geojsonLayer;

    // --- INICIALIZACIÓN DE GEOMAN ---
    map.pm.addControls({
      position: 'topleft', drawCircle: false, drawMarker: false, drawCircleMarker: false,
      drawRectangle: false, drawPolygon: true, editMode: true, dragMode: true,
      cutPolygon: true, removalMode: true,
    });
    map.pm.setPathOptions({ color: 'orange', fillColor: 'orange', fillOpacity: 0.4 });

    // <-- ÚNICO BLOQUE MODIFICADO: Ahora gestionamos el toggle manualmente -->
    map.pm.Toolbar.createCustomControl({
        name: 'CutLayer',
        block: 'custom',
        title: 'Cortar Calle (Activar/Desactivar Modo Corte)',
        className: 'leaflet-pm-icon-cut',
        toggle: false, // Lo ponemos a false para tomar el control nosotros.
        onClick: (e) => {
            // Invertimos nuestro estado manualmente cada vez que se hace clic
            isCuttingMode = !isCuttingMode;

            // Sincronizamos el estilo del botón y el cursor con nuestro estado
            if (isCuttingMode) {
                // Activando modo corte
                e.target.classList.add('active'); // Añadimos la clase para que se vea "pulsado"
                map.getContainer().style.cursor = 'crosshair';
            } else {
                // Desactivando modo corte
                e.target.classList.remove('active'); // Quitamos la clase
                map.getContainer().style.cursor = '';
            }
        },
    });

    // --- LÓGICA DE EDICIÓN ---
    let selectedLayer = null;
    let isCuttingMode = false; // <-- AÑADIDO: Variable de estado para el modo corte

    function openEditPanel(layer) {
        // Al abrir el panel de edición, nos aseguramos de que el modo corte esté desactivado
        if (isCuttingMode) {
            isCuttingMode = false;
            map.getContainer().style.cursor = '';
            const cutButton = document.querySelector('.leaflet-pm-icon-cut');
            if(cutButton) cutButton.classList.remove('active');
        }
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
    
    // <-- AÑADIDO: Nueva función para manejar la lógica de corte -->
    async function handleCutStreet(layer, cutLatLng) {
        if (!confirm('¿Estás seguro de que quieres dividir esta calle en este punto?')) {
            return;
        }

        const osm_id = layer.feature.properties.id;
        const city = 'Badajoz'; // O la ciudad activa que tengas

        // Mostrar feedback visual al usuario
        loadingOverlay.style.display = 'flex';
        loadingText.textContent = 'Dividiendo calle...';

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No hay sesión activa para realizar esta acción.');

            const response = await fetch('/api/splitStreet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    osm_id: osm_id,
                    cut_point: cutLatLng,
                    city: city,
                }),
            });

            const result = await response.json();
            if (!response.ok) {
                // Si la API devuelve un error con detalles, lo mostramos
                throw new Error(result.details || result.error || 'Error desconocido del servidor.');
            }

            // --- Éxito: Actualizar el mapa dinámicamente ---
            // 1. Eliminar la capa original del mapa
            geojsonLayer.removeLayer(layer);

            // 2. Añadir las nuevas capas que nos ha devuelto la API
            const newWaysGeoJSON = {
                type: "FeatureCollection",
                features: result.map(way => ({
                    type: "Feature",
                    geometry: way.geom, // La API ya devuelve el formato GeoJSON correcto
                    properties: { id: way.id, tags: way.tags }
                }))
            };
            geojsonLayer.addData(newWaysGeoJSON);

            loadingText.textContent = '¡Calle dividida con éxito!';
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
            }, 1500);

        } catch (error) {
            console.error('Error al dividir la calle:', error);
            alert(`No se pudo dividir la calle: ${error.message}`);
            loadingOverlay.style.display = 'none';
        } finally {
            // Desactivamos y reactivamos el modo edición para resetear el estado de Geoman
            isCuttingMode = false;
            map.getContainer().style.cursor = '';
            
            // Asegurarse de que el botón de la UI no se quede "activo" visualmente
            const cutButton = document.querySelector('.leaflet-pm-icon-cut');
            if(cutButton && cutButton.classList.contains('active')) {
                cutButton.classList.remove('active');
            }
        }
    }


    saveChangesBtn.addEventListener('click', async () => {
        if (!selectedLayer) return;

        const osm_id = selectedLayer.feature.properties.id;
        const newName = streetNameInput.value.trim();
        const city = 'Badajoz';

        if (!newName) {
            alert('El nombre de la calle no puede estar vacío.');
            return;
        }
        
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No hay sesión activa.');

            saveChangesBtn.textContent = 'Guardando...';
            saveChangesBtn.disabled = true;

            const response = await fetch('/api/updateStreetName', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    osm_id: osm_id,
                    display_name: newName,
                    city: city,
                }),
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Error desconocido del servidor.');
            }

            console.log('Respuesta de la API:', result.message);

            selectedLayer.bindPopup(`<b>${newName}</b><br>ID: ${osm_id}`);
            selectedLayer.feature.properties.tags.name = newName;
            
            closeEditPanel();

        } catch (error) {
            console.error('Error al guardar los cambios:', error);
            alert(`No se pudo guardar el cambio: ${error.message}`);
        } finally {
            saveChangesBtn.textContent = 'Guardar Cambios';
            saveChangesBtn.disabled = false;
        }
    });

    cancelBtn.addEventListener('click', closeEditPanel);

    // --- FUNCIÓN DE CARGA PAGINADA ---
    async function cargarCallesPaginado() {
        let currentPage = 1;
        let totalFeaturesCargadas = 0;
        let seguirCargando = true;
        console.log('Iniciando carga paginada de calles...');

        geojsonLayer = L.geoJSON(null, {
            style: function(feature) {
                const hasName = feature.properties.tags && feature.properties.tags.name;
                return { color: hasName ? "#3388ff" : "#999999", weight: hasName ? 3 : 2, opacity: hasName ? 1.0 : 0.6 };
            },
            // <-- MODIFICADO: onEachFeature ahora gestiona ambos modos (edición y corte) -->
            onEachFeature: function(feature, layer) {
                const tags = feature.properties.tags;

                // Función central para manejar el clic en cualquier capa de calle
                const onLayerClick = (e) => {
                    L.DomEvent.stopPropagation(e); // Evita que el clic se propague al mapa

                    if (isCuttingMode) {
                        // Si estamos en modo corte, llamamos a la función de corte
                        handleCutStreet(e.target, e.latlng);
                    } else {
                        // Si estamos en modo normal, abrimos el panel de edición
                        if (tags && tags.name) {
                           openEditPanel(layer);
                        }
                    }
                };

                // Asignamos el manejador de clics a las capas que son interactivas
                if (tags && tags.name) {
                    layer.bindPopup(`<b>${tags.name}</b><br>ID: ${feature.properties.id}`);
                    layer.on('click', onLayerClick);
                } else {
                    // Las calles sin nombre o sin tags no son interactivas
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
    
    // --- LÓGICA DE AUTENTICACIÓN (sin cambios) ---
    async function checkAuthAndLoad() {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            console.log('No hay sesión activa. Redirigiendo al inicio.');
            window.location.href = '/';
            return;
        }
        console.log('Sesión encontrada. Verificando rol de administrador...');
        const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (profileError || !profile || profile.role !== 'admin') {
            console.log('Acceso denigado. Se requiere rol de administrador. Redirigiendo...');
            window.location.href = '/';
            return;
        }
        console.log('¡Administrador verificado! Iniciando editor...');
        cargarCallesPaginado();
    }
    checkAuthAndLoad();
});