// --- editor.js (VERSIÓN 12 - CON BORRADO Y CREACIÓN DE VECTORES) ---

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
      drawPolyline: true, // Habilitamos el dibujo de líneas
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

    map.pm.Toolbar.createCustomControl({
        name: 'MergeLayers',
        block: 'custom',
        title: 'Unir Calles (Activar/Desactivar Modo Unión)',
        className: 'leaflet-pm-icon-polygon',
        toggle: false,
        onClick: (e) => {
            toggleMode('merge', e.target);
        },
    });

    // --- LÓGICA DE EDICIÓN ---
    let selectedLayer = null;
    let isCuttingMode = false;
    let isMergingMode = false;
    let streetsToMerge = [];

    function toggleMode(mode, buttonElement) {
        const wasActive = buttonElement?.classList.contains('active');
        isCuttingMode = false;
        isMergingMode = false;
        document.querySelector('.leaflet-pm-icon-cut').classList.remove('active');
        document.querySelector('.leaflet-pm-icon-polygon').classList.remove('active');
        resetMergeSelection(false);
        if (!wasActive) {
            if (mode === 'cut') {
                isCuttingMode = true;
                if (buttonElement) buttonElement.classList.add('active');
            } else if (mode === 'merge') {
                isMergingMode = true;
                if (buttonElement) buttonElement.classList.add('active');
            }
        }
        map.getContainer().style.cursor = isCuttingMode || isMergingMode ? 'pointer' : '';
    }

    function openEditPanel(layer) {
        if (isCuttingMode || isMergingMode) toggleMode('none');
        if (selectedLayer) {
            selectedLayer.setStyle({ color: '#3388ff', weight: 3 });
        }
        selectedLayer = layer;
        selectedLayer.setStyle({ color: 'orange', weight: 5 });

        const properties = layer.feature.properties;
        const currentName = properties.tags.name || '';
        const mergePanel = document.getElementById('merge-panel');
        if (mergePanel) mergePanel.style.display = 'none';
        
        streetNameInput.value = currentName;
        streetIdDisplay.textContent = properties.id || " (Nueva calle)"; // Indica si es nueva
        editPanel.style.display = 'block';
    }

    function closeEditPanel() {
        if (selectedLayer) {
            // Si es una capa nueva sin guardar, la eliminamos del mapa al cancelar
            if (!selectedLayer.feature.properties.id) {
                selectedLayer.remove();
            } else {
                 selectedLayer.setStyle({ color: '#3388ff', weight: 3 });
            }
        }
        selectedLayer = null;
        editPanel.style.display = 'none';
    }

    async function handleCutStreet(layer, cutLatLng) {
        // ... (esta función no cambia)
        if (!confirm('¿Seguro que quieres dividir esta calle?')) return;
        loadingOverlay.style.display = 'flex';
        loadingText.textContent = 'Dividiendo calle...';
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No hay sesión activa.');
            const response = await fetch('/api/streetActions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    action: 'split',
                    payload: {
                        osm_id: layer.feature.properties.id,
                        cut_point: cutLatLng,
                        city: 'Badajoz',
                    }
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.details || result.error || 'Error del servidor.');
            geojsonLayer.removeLayer(layer);
            const newWaysGeoJSON = {
                type: "FeatureCollection",
                features: result.map(way => ({
                    type: "Feature", geometry: way.geom, properties: { id: way.id, tags: way.tags }
                }))
            };
            geojsonLayer.addData(newWaysGeoJSON);
            loadingText.textContent = '¡Calle dividida!';
        } catch (error) {
            alert(`No se pudo dividir: ${error.message}`);
        } finally {
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 1500);
            toggleMode('none');
        }
    }

    function handleMergeSelection(layer) {
        // ... (esta función no cambia)
        const layerId = layer._leaflet_id;
        const index = streetsToMerge.findIndex(item => item._leaflet_id === layerId);
        if (index > -1) {
            streetsToMerge.splice(index, 1);
            layer.setStyle({ color: '#3388ff', weight: 3 });
        } else {
            streetsToMerge.push(layer);
            layer.setStyle({ color: '#28a745', weight: 5 });
        }
        updateMergeUI();
    }
    
    function updateMergeUI() {
        // ... (esta función no cambia)
        let mergePanel = document.getElementById('merge-panel');
        if (!mergePanel) {
            mergePanel = document.createElement('div');
            mergePanel.id = 'merge-panel';
            // ... (estilos del panel)
            document.body.appendChild(mergePanel);
        }
        if (streetsToMerge.length < 2) {
            mergePanel.style.display = 'none';
            return;
        }
        editPanel.style.display = 'none';
        const streetNames = streetsToMerge.map(l => `<li>${l.feature.properties.tags.name || `ID: ${l.feature.properties.id}`}</li>`).join('');
        mergePanel.innerHTML = `<h3>Unir Calles</h3><p>Calles seleccionadas (${streetsToMerge.length}):</p><ul style="font-size: 14px; margin-left: 20px;">${streetNames}</ul><p style="font-size: 12px; color: #555;">La calle más larga determinará el nombre.</p><button id="confirm-merge-btn">Confirmar Unión</button><button id="cancel-merge-btn">Cancelar</button>`;
        mergePanel.style.display = 'block';
        document.getElementById('confirm-merge-btn').onclick = handleMergeStreet;
        document.getElementById('cancel-merge-btn').onclick = () => resetMergeSelection(true);
    }

    function resetMergeSelection(deactivateMode) {
        // ... (esta función no cambia)
        streetsToMerge.forEach(layer => layer.setStyle({ color: '#3388ff', weight: 3 }));
        streetsToMerge = [];
        const mergePanel = document.getElementById('merge-panel');
        if (mergePanel) mergePanel.style.display = 'none';
        if (deactivateMode) toggleMode('none');
    }

    async function handleMergeStreet() {
        // ... (esta función no cambia)
        if (streetsToMerge.length < 2) return;
        loadingOverlay.style.display = 'flex';
        loadingText.textContent = 'Uniendo calles...';
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No hay sesión activa.');
            const response = await fetch('/api/streetActions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    action: 'merge',
                    payload: {
                        ids: streetsToMerge.map(l => l.feature.properties.id)
                    }
                }),
            });
            const newWay = await response.json();
            if (!response.ok) throw new Error(newWay.details || newWay.error || 'Error del servidor.');
            streetsToMerge.forEach(layer => geojsonLayer.removeLayer(layer));
            geojsonLayer.addData({
                type: "Feature", geometry: newWay.geom, properties: { id: newWay.id, tags: newWay.tags }
            });
            loadingText.textContent = '¡Calles unidas!';
        } catch (error) {
            alert(`No se pudieron unir: ${error.message}`);
        } finally {
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 1500);
            resetMergeSelection(true);
        }
    }
    
    saveChangesBtn.addEventListener('click', async () => {
        if (!selectedLayer) return;
        const osm_id = selectedLayer.feature.properties.id;
        const newName = streetNameInput.value.trim();
        if (!newName) {
            alert('El nombre de la calle no puede estar vacío.');
            return;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No hay sesión activa.');
            
            saveChangesBtn.textContent = 'Guardando...';
            saveChangesBtn.disabled = true;

            if (osm_id) {
                // --- Lógica de ACTUALIZAR una calle existente ---
                const response = await fetch('/api/updateStreetName', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                    body: JSON.stringify({ osm_id, display_name: newName, city: 'Badajoz' }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Error del servidor.');
                
                selectedLayer.feature.properties.tags.name = newName;
                selectedLayer.bindPopup(`<b>${newName}</b><br>ID: ${osm_id}`);
            } else {
                // --- Lógica de CREAR una nueva calle ---
                const response = await fetch('/api/streetActions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                    body: JSON.stringify({
                        action: 'create',
                        payload: {
                            geometry: selectedLayer.toGeoJSON().geometry,
                            tags: { name: newName },
                            city: 'Badajoz',
                        }
                    }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.details || 'Error al crear la calle.');

                // Actualizamos la capa recién creada con el ID que nos ha devuelto la API
                selectedLayer.feature.properties.id = result.id;
                selectedLayer.feature.properties.tags = result.tags;
                selectedLayer.bindPopup(`<b>${newName}</b><br>ID: ${result.id}`);
            }
            closeEditPanel();
        } catch (error) {
            alert(`No se pudo guardar: ${error.message}`);
        } finally {
            saveChangesBtn.textContent = 'Guardar Cambios';
            saveChangesBtn.disabled = false;
        }
    });

    cancelBtn.addEventListener('click', closeEditPanel);

    // --- NUEVOS LISTENERS DE GEOMAN ---
    map.on('pm:remove', async (e) => {
        const id = e.layer.feature?.properties?.id;
        // Solo actuamos si la capa borrada es una calle existente con ID
        if (id) {
            if (!confirm(`¿Seguro que quieres borrar la calle con ID: ${id}?`)) {
                // Si el usuario cancela, volvemos a añadir la capa al mapa
                e.layer.addTo(geojsonLayer);
                return;
            }
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) throw new Error('No hay sesión activa.');
                
                await fetch('/api/streetActions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                    body: JSON.stringify({
                        action: 'delete',
                        payload: { id }
                    }),
                });
            } catch (error) {
                alert(`No se pudo borrar la calle en la base de datos: ${error.message}`);
                e.layer.addTo(geojsonLayer); // La restauramos si falla la API
            }
        }
    });

    map.on('pm:create', (e) => {
        // Solo nos interesan las líneas (calles), no polígonos u otros
        if (e.shape === 'Line') {
            const layer = e.layer;
            // Añadimos la estructura de properties necesaria para que funcione
            layer.feature = { type: 'Feature', properties: { tags: {} } };
            // Abrimos el panel para que el usuario le ponga nombre
            openEditPanel(layer);
        }
    });


    async function cargarCallesPaginado() {
        // ... (esta función no cambia)
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
                const invisibleHitbox = L.polyline(layer.getLatLngs(), {
                    color: 'transparent',
                    weight: 20,
                    interactive: true,
                });
                invisibleHitbox.visibleLayer = layer;
                invisibleHitbox.addTo(geojsonLayer);
                const onLayerClick = (e) => {
                    L.DomEvent.stopPropagation(e);
                    const visibleLayer = e.target.visibleLayer;
                    if (isCuttingMode) {
                        handleCutStreet(visibleLayer, e.latlng);
                    } else if (isMergingMode) {
                        handleMergeSelection(visibleLayer);
                    } else {
                        if (tags && tags.name) {
                           openEditPanel(visibleLayer);
                        }
                    }
                };
                invisibleHitbox.on('click', onLayerClick);
                if (tags && tags.name) {
                    layer.bindPopup(`<b>${tags.name}</b><br>ID: ${feature.properties.id}`);
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
    
    async function checkAuthAndLoad() {
        // ... (esta función no cambia)
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