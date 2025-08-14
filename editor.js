// --- editor.js (Versión de Depuración con "Chivatos") ---

document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURACIÓN E INICIALIZACIÓN (MÉTODO CLÁSICO Y FIABLE) ---
    const SUPABASE_URL = 'https://hppzwfwtedghpsxfonoh.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjQzNDMsImV4cCI6MjA2OTcwMDQ0M30.BAh6i5iJ5YkDBoydfkC9azAD4eMdYBkEBdxws9kj5Hg';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- LÓGICA PRINCIPAL DEL EDITOR (encapsulada) ---
    function iniciarEditor() {
        console.log('¡Administrador verificado! Iniciando la construcción del editor...');
        // (El resto de la lógica del editor, que sabemos que funciona, va aquí. No la toco para no añadir ruido.)
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingText = loadingOverlay.querySelector('p');
        const editPanel = document.getElementById('edit-panel');
        const streetNameInput = document.getElementById('street-name-input');
        const streetIdDisplay = document.getElementById('street-id-display');
        const saveChangesBtn = document.getElementById('save-changes-btn');
        const cancelBtn = document.getElementById('cancel-btn');
        const map = L.map('editor-map').setView([38.88, -6.97], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '© CARTO', maxZoom: 20 }).addTo(map);
        let geojsonLayer;
        map.pm.addControls({ position: 'topleft', drawCircle: false, drawMarker: false, drawCircleMarker: false, drawRectangle: false, drawPolygon: true, editMode: true, dragMode: true, cutPolygon: true, removalMode: true });
        map.pm.setPathOptions({ color: 'orange', fillColor: 'orange', fillOpacity: 0.4 });
        let selectedLayer = null;
        function openEditPanel(layer) { selectedLayer = layer; const properties = layer.feature.properties; const currentName = properties.tags.name || ''; streetNameInput.value = currentName; streetIdDisplay.textContent = properties.id; editPanel.style.display = 'block'; }
        function closeEditPanel() { editPanel.style.display = 'none'; selectedLayer = null; }
        saveChangesBtn.addEventListener('click', async () => { if (!selectedLayer) return; const osm_id = selectedLayer.feature.properties.id; const newName = streetNameInput.value.trim(); const city = 'Badajoz'; if (!newName) { alert('El nombre de la calle no puede estar vacío.'); return; } try { const { data: { session } } = await supabase.auth.getSession(); if (!session) throw new Error('No hay sesión activa.'); saveChangesBtn.textContent = 'Guardando...'; saveChangesBtn.disabled = true; const response = await fetch('/api/updateStreetName', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ osm_id: osm_id, display_name: newName, city: city }), }); const result = await response.json(); if (!response.ok) { throw new Error(result.error || 'Error desconocido del servidor.'); } console.log('Respuesta de la API:', result.message); selectedLayer.bindPopup(`<b>${newName}</b><br>ID: ${osm_id}`); selectedLayer.feature.properties.tags.name = newName; closeEditPanel(); } catch (error) { console.error('Error al guardar los cambios:', error); alert(`No se pudo guardar el cambio: ${error.message}`); } finally { saveChangesBtn.textContent = 'Guardar Cambios'; saveChangesBtn.disabled = false; } });
        cancelBtn.addEventListener('click', closeEditPanel);
        async function cargarCallesPaginado() { let currentPage = 1; let totalFeaturesCargadas = 0; let seguirCargando = true; console.log('Iniciando carga paginada de calles...'); geojsonLayer = L.geoJSON(null, { style: function(feature) { const hasName = feature.properties.tags && feature.properties.tags.name; return { color: hasName ? "#3388ff" : "#999999", weight: hasName ? 3 : 2, opacity: hasName ? 1.0 : 0.6 }; }, onEachFeature: function(feature, layer) { const tags = feature.properties.tags; if (tags && tags.name) { layer.bindPopup(`<b>${tags.name}</b><br>ID: ${feature.properties.id}`); layer.on('click', (e) => { L.DomEvent.stopPropagation(e); openEditPanel(layer); }); } else { layer.options.interactive = false; } } }).addTo(map); while (seguirCargando) { try { loadingText.textContent = `Cargando lote ${currentPage}...`; const response = await fetch(`/api/getCityStreets?page=${currentPage}`); if (!response.ok) throw new Error('Respuesta de API no válida.'); const geojsonData = await response.json(); const numFeatures = geojsonData.features.length; if (numFeatures > 0) { totalFeaturesCargadas += numFeatures; geojsonLayer.addData(geojsonData); currentPage++; } else { seguirCargando = false; } } catch (error) { console.error(`Error al cargar el lote ${currentPage}:`, error); loadingText.innerHTML = `<p style="color:red;">Error en lote ${currentPage}: ${error.message}</p>`; seguirCargando = false; } } loadingText.textContent = `¡Carga completada! ${totalFeaturesCargadas} calles en el mapa.`; setTimeout(() => loadingOverlay.style.display = 'none', 2000); }
        cargarCallesPaginado();
        map.on('pm:cut', async (e) => { const originalLayer = e.originalLayer; const newLayer = e.layer; const osm_id = originalLayer.feature.properties.id; console.log(`Calle con ID ${osm_id} ha sido cortada.`); const latlngs = newLayer.getLatLngs()[0]; const cut_point = latlngs[latlngs.length - 1]; if (confirm(`¿Quieres dividir permanentemente la calle con ID ${osm_id} en este punto?`)) { try { const { data: { session } } = await supabase.auth.getSession(); if (!session) throw new Error('No hay sesión activa.'); loadingOverlay.style.display = 'flex'; loadingText.textContent = 'Dividiendo calle...'; const response = await fetch('/api/splitStreet', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ osm_id: osm_id, cut_point: cut_point, city: 'Badajoz' }), }); if (!response.ok) { const err = await response.json(); throw new Error(err.details || 'Error en la API de corte'); } alert('¡Calle dividida! La página se recargará.'); window.location.reload(); } catch (error) { alert(`No se pudo dividir la calle: ${error.message}`); loadingOverlay.style.display = 'none'; } } });
    }

    // --- PUNTO DE ENTRADA Y AUTENTICACIÓN CON CHIVATOS ---
    console.log("Editor.js cargado. Esperando estado de autenticación de Supabase...");
    
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log(`Evento de Auth recibido: ${event}`);

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            if (window.editorIniciado) return;

            if (session) {
                // --- CHIVATO 1 ---
                console.log("CHIVATO 1: Sesión encontrada. ID de usuario:", session.user.id);
                
                try {
                    // --- CHIVATO 2 ---
                    console.log("CHIVATO 2: Intentando obtener el perfil de la base de datos...");
                    const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
                    
                    // --- CHIVATO 3 ---
                    console.log("CHIVATO 3: La consulta a la base de datos ha terminado.");

                    if (error) {
                        // --- CHIVATO 4 ---
                        console.error("CHIVATO 4: La consulta devolvió un ERROR:", error);
                        window.location.href = '/';
                        return;
                    }

                    if (profile && profile.role === 'admin') {
                        // --- CHIVATO 5 ---
                        console.log("CHIVATO 5: ¡ÉXITO! El perfil es de admin. Iniciando editor...");
                        window.editorIniciado = true;
                        iniciarEditor();
                    } else {
                        // --- CHIVATO 6 ---
                        console.log(`CHIVATO 6: El perfil no es de admin. Rol encontrado: ${profile ? profile.role : 'ninguno'}. Redirigiendo...`);
                        window.location.href = '/';
                    }
                } catch (e) {
                    console.error("CHIVATO DE EXCEPCIÓN: Ha ocurrido una excepción inesperada:", e);
                    window.location.href = '/';
                }

            } else if (event === 'INITIAL_SESSION') {
                console.log("No hay sesión inicial. Redirigiendo...");
                window.location.href = '/';
            }
        } else if (event === 'SIGNED_OUT') {
            console.log("Sesión cerrada. Redirigiendo...");
            window.location.href = '/';
        }
    });
});