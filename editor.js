// --- editor.js (VERSIÓN 17 - VOLVIENDO A LA API ORIGINAL) ---

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
    const statusPanel = document.getElementById('status-panel');
    const citySelectorModal = document.getElementById('city-selector-modal');
    const cityListContainer = document.getElementById('city-list');

    // --- INICIALIZACIÓN DEL MAPA ---
    const map = L.map('editor-map').setView([40.41, -3.70], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© CARTO', maxZoom: 20
    }).addTo(map);
    
    let geojsonLayer;

    // --- INICIALIZACIÓN DE GEOMAN ---
    map.pm.addControls({
      position: 'topleft',
      drawPolyline: true,
      editMode: true,
      dragMode: true,
      removalMode: true,
      drawMarker: false,
      drawCircleMarker: false,
      drawPolygon: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      cutPolygon: false,
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

    map.on('pm:globaldrawmodetoggled', (e) => {
        if (e.enabled) {
            updateStatusPanel('MODO CREAR: Dibuja una nueva calle en el mapa.');
        } else {
            updateStatusPanel('', false);
        }
    });

    map.on('pm:globalremovalmodetoggled', (e) => {
        if (e.enabled) {
            updateStatusPanel('MODO BORRAR: Haz clic en una calle para eliminarla.');
        } else {
            updateStatusPanel('', false);
        }
    });

    map.on('pm:globaleditmodetoggled', (e) => {
        if (e.enabled) {
            updateStatusPanel('MODO EDITAR: Arrastra los puntos para modificar la geometría.');
        } else {
            updateStatusPanel('', false);
        }
    });


    // --- LÓGICA DE EDICIÓN ---
    let selectedLayer = null;
    let isCuttingMode = false;
    let isMergingMode = false;
    let streetsToMerge = [];
    let selectedCity = null;
    let originalStreetNameForEdit = null; 

    function updateStatusPanel(text, active = true) {
        if (active && text) {
            statusPanel.textContent = text;
            statusPanel.style.display = 'block';
        } else {
            statusPanel.style.display = 'none';
        }
    }

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
                updateStatusPanel('MODO CORTAR: Haz clic en una calle para dividirla.');
            } else if (mode === 'merge') {
                isMergingMode = true;
                if (buttonElement) buttonElement.classList.add('active');
                updateStatusPanel('MODO UNIR: Selecciona dos calles para unirlas.');
            }
        } else {
            updateStatusPanel('', false);
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
        streetIdDisplay.textContent = properties.id || " (Nueva calle)";
        editPanel.style.display = 'block';
        
        originalStreetNameForEdit = currentName;
    }

    function closeEditPanel() {
        if (selectedLayer) {
            if (!selectedLayer.feature.properties.id) {
                selectedLayer.remove();
            } else {
                 selectedLayer.setStyle({ color: '#3388ff', weight: 3 });
            }
        }
        selectedLayer = null;
        editPanel.style.display = 'none';
        originalStreetNameForEdit = null;
    }

    async function handleCutStreet(layer, cutLatLng) {
        if (!confirm('¿Seguro que quieres dividir esta calle?')) return;
        loadingOverlay.style.display = 'flex';
        loadingText.textContent = 'Dividiendo calle...';
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No hay sesión activa.');
            
            // --- INICIO DE LA MODIFICACIÓN ---
            // Añadimos el osm_name de la calle original para que el backend pueda invalidar la caché
            const originalOsmName = layer.feature.properties.tags.name;
            // --- FIN DE LA MODIFICACIÓN ---

            const response = await fetch('/api/streetActions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    action: 'split',
                    payload: {
                        osm_id: layer.feature.properties.id,
                        cut_point: cutLatLng,
                        city: selectedCity.name,
                        // --- INICIO DE LA MODIFICACIÓN ---
                        osm_name: originalOsmName // Lo enviamos en el payload
                        // --- FIN DE LA MODIFICACIÓN ---
                    }
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.details || result.error || 'Error del servidor.');
            
            // --- INICIO DE LA MODIFICACIÓN ---
            // Usamos el mensaje de la API como chivato
            if (result.message) {
                loadingText.textContent = result.message;
            } else {
                loadingText.textContent = '¡Calle dividida!';
            }
            // --- FIN DE LA MODIFICACIÓN ---

            geojsonLayer.removeLayer(layer);
            const newWaysGeoJSON = {
                type: "FeatureCollection",
                features: result.new_ways.map(way => ({ // Suponiendo que la API devuelve un objeto con la propiedad new_ways
                    type: "Feature", geometry: way.geom, properties: { id: way.id, tags: way.tags }
                }))
            };
            geojsonLayer.addData(newWaysGeoJSON);
            
        } catch (error) {
            alert(`No se pudo dividir: ${error.message}`);
        } finally {
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 2000);
            toggleMode('none');
        }
    }

    function handleMergeSelection(layer) {
        const layerId = layer.feature.properties.id;
        if (!layerId) {
            alert("No se puede unir una calle que aún no ha sido guardada.");
            return;
        }

        const index = streetsToMerge.findIndex(item => item.feature.properties.id === layerId);
        
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
        let mergePanel = document.getElementById('merge-panel');
        if (!mergePanel) {
            mergePanel = document.createElement('div');
            mergePanel.id = 'merge-panel';
            mergePanel.style.position = 'absolute';
            mergePanel.style.top = '10px';
            mergePanel.style.right = '10px';
            mergePanel.style.width = '300px'; 
            mergePanel.style.zIndex = '1001';
            mergePanel.style.background = 'white';
            mergePanel.style.padding = '15px';
            mergePanel.style.borderRadius = '5px';
            mergePanel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
            document.body.appendChild(mergePanel);
        }

        if (streetsToMerge.length < 2) {
            mergePanel.style.display = 'none';
            return;
        }

        const uniqueIds = new Set(streetsToMerge.map(l => l.feature.properties.id));
        const canMerge = uniqueIds.size > 1;

        editPanel.style.display = 'none';
        const streetNames = streetsToMerge.map(l => `<li>${l.feature.properties.tags.name || `ID: ${l.feature.properties.id}`}</li>`).join('');
        
        let mergeButtonHTML = `<button id="confirm-merge-btn" style="background-color: #28a745; color: white; padding: 10px; border: none; width: 100%; border-radius: 4px; cursor: pointer;">Confirmar Unión</button>`;
        let warningMessage = `<p style="font-size: 12px; color: #555;">La calle más larga determinará el nombre.</p>`;
        
        if (!canMerge) {
            warningMessage = `<p style="font-size: 12px; color: #dc3545; font-weight: bold;">No se pueden unir segmentos de la misma calle. Usa la herramienta 'Cortar' primero si es necesario.</p>`;
            mergeButtonHTML = `<button id="confirm-merge-btn" disabled style="background-color: #6c757d; color: white; padding: 10px; border: none; width: 100%; border-radius: 4px; cursor: not-allowed;">Confirmar Unión</button>`;
        }
        
        mergePanel.innerHTML = `<h3>Unir Calles</h3><p>Calles seleccionadas (${streetsToMerge.length}):</p><ul style="font-size: 14px; margin-left: 20px;">${streetNames}</ul>${warningMessage}${mergeButtonHTML}<button id="cancel-merge-btn" style="background-color: #dc3545; color: white; padding: 10px; border: none; width: 100%; border-radius: 4px; margin-top: 5px; cursor: pointer;">Cancelar</button>`;
        mergePanel.style.display = 'block';
        
        if (canMerge) {
            document.getElementById('confirm-merge-btn').onclick = handleMergeStreet;
        }
        document.getElementById('cancel-merge-btn').onclick = () => resetMergeSelection(true);
    }

    function resetMergeSelection(deactivateMode) {
        streetsToMerge.forEach(layer => layer.setStyle({ color: '#3388ff', weight: 3 }));
        streetsToMerge = [];
        const mergePanel = document.getElementById('merge-panel');
        if (mergePanel) mergePanel.style.display = 'none';
        if (deactivateMode) toggleMode('none');
    }

    async function handleMergeStreet() {
        if (streetsToMerge.length < 2) return;
        loadingOverlay.style.display = 'flex';
        loadingText.textContent = 'Uniendo calles...';
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('No hay sesión activa.');

            // --- INICIO DE LA MODIFICACIÓN ---
            // En lugar de una lista de IDs, enviamos una lista de objetos con toda la info necesaria
            const streetsPayload = streetsToMerge.map(l => ({
                id: l.feature.properties.id,
                osm_name: l.feature.properties.tags.name,
                city: selectedCity.name
            }));
            // --- FIN DE LA MODIFICACIÓN ---

            const response = await fetch('/api/streetActions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    action: 'merge',
                    // --- INICIO DE LA MODIFICACIÓN ---
                    payload: {
                        streets_to_merge: streetsPayload
                    }
                    // --- FIN DE LA MODIFICACIÓN ---
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.details || result.error || 'Error del servidor.');
            }
            streetsToMerge.forEach(layer => geojsonLayer.removeLayer(layer));
            geojsonLayer.addData({
                type: "Feature", geometry: result.new_way.geom, properties: { id: result.new_way.id, tags: result.new_way.tags }
            });
            
            // --- INICIO DE LA MODIFICACIÓN ---
            // Usamos el mensaje de la API como chivato
            loadingText.textContent = result.message || '¡Calles unidas!';
            // --- FIN DE LA MODIFICACIÓN ---

        } catch (error) {
            alert(`No se pudieron unir: ${error.message}`);
        } finally {
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 2000);
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
                const response = await fetch('/api/updateStreetName', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                    body: JSON.stringify({ 
                        osm_id: osm_id, 
                        display_name: newName, 
                        city: selectedCity.name, 
                        original_osm_name: originalStreetNameForEdit
                    }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Error del servidor.');
                
                selectedLayer.feature.properties.tags.name = newName;
                selectedLayer.bindPopup(`<b>${newName}</b><br>ID: ${osm_id}`);
                alert(result.message);

            } else {
                const response = await fetch('/api/streetActions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                    body: JSON.stringify({
                        action: 'create',
                        payload: {
                            geometry: selectedLayer.toGeoJSON().geometry,
                            tags: { name: newName },
                            city: selectedCity.name,
                        }
                    }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.details || 'Error al crear la calle.');

                selectedLayer.feature.properties.id = result.id;
                selectedLayer.feature.properties.tags = { name: newName };
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

    map.on('pm:remove', async (e) => {
        const id = e.layer.feature?.properties?.id;
        if (id) {
            if (!confirm(`¿Seguro que quieres borrar la calle con ID: ${id}?`)) {
                e.layer.addTo(geojsonLayer); // Vuelve a añadir la capa si el usuario cancela
                return;
            }
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) throw new Error('No hay sesión activa.');
                
                // --- INICIO DE LA MODIFICACIÓN ---
                // Obtenemos los datos necesarios para la invalidación de caché
                const osmName = e.layer.feature.properties.tags.name;
                const city = selectedCity.name;
                // --- FIN DE LA MODIFICACIÓN ---

                const response = await fetch('/api/streetActions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                    body: JSON.stringify({
                        action: 'delete',
                        // --- INICIO DE LA MODIFICACIÓN ---
                        payload: { id, osm_name: osmName, city }
                        // --- FIN DE LA MODIFICACIÓN ---
                    }),
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.details || 'Error del servidor.');
                // Usamos la respuesta de la API como chivato
                alert(result.message);

            } catch (error) {
                alert(`No se pudo borrar la calle en la base de datos: ${error.message}`);
                e.layer.addTo(geojsonLayer); // Si falla, la volvemos a añadir al mapa
            }
        }
    });

    map.on('pm:create', (e) => {
        if (e.shape === 'Line' || e.shape === 'Polygon') {
            const layer = e.layer;
            layer.feature = { type: 'Feature', properties: { tags: {} } };
            openEditPanel(layer);
        }
    });


    async function cargarCallesPaginado(cityName) {
        let currentPage = 1;
        let totalFeaturesCargadas = 0;
        let seguirCargando = true;
        console.log(`Iniciando carga paginada para la ciudad: ${cityName}...`);

        if (geojsonLayer) {
            map.removeLayer(geojsonLayer);
        }

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
                        openEditPanel(visibleLayer);
                    }
                };
                invisibleHitbox.on('click', onLayerClick);
                if (tags && tags.name) {
                    layer.bindPopup(`<b>${tags.name}</b><br>ID: ${feature.properties.id}`);
                } else {
                    layer.bindPopup(`<b>Calle sin nombre</b><br>ID: ${feature.properties.id}`);
                }
            }
        }).addTo(map);

        loadingOverlay.style.display = 'flex';

        while (seguirCargando) {
            try {
                loadingText.textContent = `Cargando lote ${currentPage} de ${cityName}...`;
                const response = await fetch(`/api/getCityStreets?page=${currentPage}&city=${cityName}`);
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
        loadingText.textContent = `¡Carga completada! ${totalFeaturesCargadas} calles de ${cityName} en el mapa.`;
        setTimeout(() => loadingOverlay.style.display = 'none', 2000);
    }

    async function showCitySelector() {
        citySelectorModal.style.display = 'flex';
        cityListContainer.innerHTML = '<p>Cargando ciudades...</p>';
        try {
            const { data: cities, error } = await supabase.from('cities').select('*').order('name');
            if (error) throw error;
            
            cityListContainer.innerHTML = '';
            cities.forEach(city => {
                const button = document.createElement('button');
                button.textContent = city.name;
                button.addEventListener('click', () => {
                    selectedCity = city; 
                    citySelectorModal.style.display = 'none'; 
                    map.setView([city.center_lat, city.center_lng], city.default_zoom);
                    cargarCallesPaginado(city.name);
                });
                cityListContainer.appendChild(button);
            });

        } catch (error) {
            cityListContainer.innerHTML = `<p style="color:red;">Error al cargar las ciudades: ${error.message}</p>`;
        }
    }
    
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
            console.log('Acceso denegado. Se requiere rol de administrador. Redirigiendo...');
            window.location.href = '/';
            return;
        }
        console.log('¡Administrador verificado! Mostrando selector de ciudad...');
        loadingOverlay.style.display = 'none'; 
        showCitySelector();
    }
    checkAuthAndLoad();
});