// --- editor.js (Versión 9 - Con Corte y Unión de Calles) ---

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

    map.pm.Toolbar.createCustomControl({
        name: 'CutLayer',
        block: 'custom',
        title: 'Cortar Calle (Activar/Desactivar Modo Corte)',
        className: 'leaflet-pm-icon-cut',
        toggle: false,
        onClick: (e) => {
            toggleMode('cut', e.target);
        },
    });

    // <-- AÑADIDO: Botón para UNIR calles -->
    map.pm.Toolbar.createCustomControl({
        name: 'MergeLayers',
        block: 'custom',
        title: 'Unir Calles (Activar/Desactivar Modo Unión)',
        className: 'leaflet-pm-icon-polygon', // Reutilizamos un icono existente
        toggle: false,
        onClick: (e) => {
            toggleMode('merge', e.target);
        },
    });

    // --- LÓGICA DE EDICIÓN ---
    let selectedLayer = null;
    let isCuttingMode = false;
    let isMergingMode = false; // <-- AÑADIDO: Estado para el modo unión
    let streetsToMerge = [];   // <-- AÑADIDO: Array para guardar las calles a unir

    // <-- AÑADIDO: Función central para gestionar los modos de edición -->
    function toggleMode(mode, buttonElement) {
        // Desactiva cualquier otro modo antes de activar el nuevo
        isCuttingMode = false;
        isMergingMode = false;
        document.querySelector('.leaflet-pm-icon-cut').classList.remove('active');
        document.querySelector('.leaflet-pm-icon-polygon').classList.remove('active');

        if (mode === 'cut') {
            isCuttingMode = !buttonElement.classList.contains('active'); // Invertimos el estado actual
            if (isCuttingMode) buttonElement.classList.add('active');
        } else if (mode === 'merge') {
            isMergingMode = !buttonElement.classList.contains('active');
            if (isMergingMode) buttonElement.classList.add('active');
            else resetMergeSelection(); // Si desactivamos el modo, limpiamos la selección
        }

        map.getContainer().style.cursor = isCuttingMode || isMergingMode ? 'pointer' : '';
    }

    function openEditPanel(layer) {
        // Al abrir el panel, nos aseguramos de que ningún modo especial esté activo
        if (isCuttingMode || isMergingMode) toggleMode('none');

        selectedLayer = layer;
        const properties = layer.feature.properties;
        const currentName = properties.tags.name || '';
        streetNameInput.value = currentName;
        streetIdDisplay.textContent = properties.id;

        // Mostramos el panel de edición normal
        editPanel.innerHTML = `
            <h3>Editar Calle</h3>
            <label for="street-name-input">Nombre de la calle:</label>
            <input type="text" id="street-name-input" value="${currentName}">
            <p style="font-size: 12px; color: #555;">ID de OSM: <span id="street-id-display">${properties.id}</span></p>
            <button id="save-changes-btn">Guardar Cambios</button>
            <button id="cancel-btn">Cancelar</button>
        `;
        editPanel.style.display = 'block';

        // Re-asignamos los listeners a los nuevos botones
        document.getElementById('save-changes-btn').onclick = saveChanges;
        document.getElementById('cancel-btn').onclick = closeEditPanel;
    }

    function closeEditPanel() {
        editPanel.style.display = 'none';
        selectedLayer = null;
    }

    async function saveChanges() {
        // Re-implementamos la lógica aquí porque el botón se regenera
        if (!selectedLayer) return;
        const osm_id = selectedLayer.feature.properties.id;
        const newName = document.getElementById('street-name-input').value.trim();
        const city = 'Badajoz';

        if (!newName) {
            alert('El nombre de la calle no puede estar vacío.');
            return;
        }
        
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No hay sesión activa.');

            const saveBtn = document.getElementById('save-changes-btn');
            saveBtn.textContent = 'Guardando...';
            saveBtn.disabled = true;

            // La lógica de fetch es la misma
            const response = await fetch('/api/updateStreetName', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ osm_id, display_name: newName, city }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Error del servidor.');

            selectedLayer.bindPopup(`<b>${newName}</b><br>ID: ${osm_id}`);
            selectedLayer.feature.properties.tags.name = newName;
            closeEditPanel();

        } catch (error) {
            alert(`No se pudo guardar: ${error.message}`);
        }
    }
    
    async function handleCutStreet(layer, cutLatLng) {
        if (!confirm('¿Estás seguro de que quieres dividir esta calle en este punto?')) return;

        const osm_id = layer.feature.properties.id;
        const city = 'Badajoz';

        loadingOverlay.style.display = 'flex';
        loadingText.textContent = 'Dividiendo calle...';

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No hay sesión activa.');
            const response = await fetch('/api/splitStreet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ osm_id, cut_point: cutLatLng, city }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.details || result.error || 'Error del servidor.');

            geojsonLayer.removeLayer(layer);
            const newWaysGeoJSON = {
                type: "FeatureCollection",
                features: result.map(way => ({
                    type: "Feature",
                    geometry: way.geom,
                    properties: { id: way.id, tags: way.tags }
                }))
            };
            geojsonLayer.addData(newWaysGeoJSON);
            loadingText.textContent = '¡Calle dividida con éxito!';
            
        } catch (error) {
            alert(`No se pudo dividir: ${error.message}`);
        } finally {
            loadingOverlay.style.display = 'none';
            toggleMode('none'); // Resetea todos los modos
        }
    }
    
    // <-- AÑADIDO: Funciones para gestionar la unión de calles -->
    function handleMergeSelection(layer) {
        const layerId = layer._leaflet_id;
        const index = streetsToMerge.findIndex(item => item._leaflet_id === layerId);

        if (index > -1) {
            // Deseleccionar: quitar del array y resetear estilo
            streetsToMerge.splice(index, 1);
            layer.setStyle({ color: '#3388ff', weight: 3 }); // Estilo original
        } else {
            // Seleccionar: añadir al array y resaltar
            streetsToMerge.push(layer);
            layer.setStyle({ color: '#28a745', weight: 5 }); // Estilo de selección (verde)
        }
        updateMergeUI();
    }

    function updateMergeUI() {
        if (streetsToMerge.length < 2) {
            editPanel.style.display = 'none';
            return;
        }
        
        const streetNames = streetsToMerge.map(l => `<li>${l.feature.properties.tags.name || `ID: ${l.feature.properties.id}`}</li>`).join('');

        editPanel.innerHTML = `
            <h3>Unir Calles</h3>
            <p>Calles seleccionadas (${streetsToMerge.length}):</p>
            <ul style="font-size: 14px; margin-left: 20px;">${streetNames}</ul>
            <p style="font-size: 12px; color: #555;">La calle más larga determinará el nombre final.</p>
            <button id="confirm-merge-btn">Confirmar Unión</button>
            <button id="cancel-merge-btn">Cancelar</button>
        `;
        editPanel.style.display = 'block';

        document.getElementById('confirm-merge-btn').onclick = handleMergeStreet;
        document.getElementById('cancel-merge-btn').onclick = resetMergeSelection;
    }

    function resetMergeSelection() {
        streetsToMerge.forEach(layer => layer.setStyle({ color: '#3388ff', weight: 3 }));
        streetsToMerge = [];
        editPanel.style.display = 'none';
        toggleMode('none');
    }

    async function handleMergeStreet() {
        if (streetsToMerge.length < 2) return;
        
        const idsToMerge = streetsToMerge.map(l => l.feature.properties.id);

        loadingOverlay.style.display = 'flex';
        loadingText.textContent = 'Uniendo calles...';
        
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No hay sesión activa.');

            const response = await fetch('/api/mergeStreets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ ids: idsToMerge }),
            });
            const newWay = await response.json();
            if (!response.ok) throw new Error(newWay.details || newWay.error || 'Error del servidor.');
            
            // Éxito: actualizar el mapa
            streetsToMerge.forEach(layer => geojsonLayer.removeLayer(layer));
            geojsonLayer.addData({
                type: "Feature",
                geometry: newWay.geom,
                properties: { id: newWay.id, tags: newWay.tags }
            });
            
            loadingText.textContent = '¡Calles unidas con éxito!';

        } catch (error) {
            alert(`No se pudieron unir las calles: ${error.message}`);
        } finally {
            loadingOverlay.style.display = 'none';
            resetMergeSelection();
        }
    }

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
            onEachFeature: function(feature, layer) {
                const tags = feature.properties.tags;
                
                const onLayerClick = (e) => {
                    L.DomEvent.stopPropagation(e);
                    
                    if (isCuttingMode) {
                        handleCutStreet(e.target, e.latlng);
                    } else if (isMergingMode) { // <-- AÑADIDO: Lógica para modo unión
                        handleMergeSelection(e.target);
                    } else {
                        if (tags && tags.name) {
                           openEditPanel(layer);
                        }
                    }
                };

                if (tags && tags.name) {
                    layer.bindPopup(`<b>${tags.name}</b><br>ID: ${feature.properties.id}`);
                    layer.on('click', onLayerClick);
                } else {
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
        // ... (el resto del fichero es idéntico)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            console.log('No hay sesión activa. Redirigiendo al inicio.');
            window.location.href = '/';
            return;
        }
        console.log('Sesión encontrada. Verificando rol de administrador...');
        const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single();
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