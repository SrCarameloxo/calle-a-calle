// --- editor.js (Versión 2 - Paginado) ---

document.addEventListener('DOMContentLoaded', () => {

    const SUPABASE_URL = 'https://hppzwfwtedghpsxfonoh.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjQzNDMsImV4cCI6MjA2OTcwMDM0M30.BAh6i5iJ5YkDBoydfkC9azAD4eMdYBkEBdxws9kj5Hg';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = loadingOverlay.querySelector('p');
    
    const map = L.map('editor-map').setView([38.88, -6.97], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© CARTO', maxZoom: 20
    }).addTo(map);

    async function cargarCallesPaginado() {
        let currentPage = 1;
        let totalFeaturesCargadas = 0;
        let seguirCargando = true;

        console.log('Iniciando carga paginada de calles...');

        while (seguirCargando) {
            try {
                loadingText.textContent = `Cargando lote ${currentPage}...`;
                
                // Pedimos el lote actual a la API
                const response = await fetch(`/api/getCityStreets?page=${currentPage}`);
                if (!response.ok) throw new Error('Respuesta de API no válida.');

                const geojsonData = await response.json();
                const numFeatures = geojsonData.features.length;
                
                if (numFeatures > 0) {
                    totalFeaturesCargadas += numFeatures;
                    console.log(`Recibido lote ${currentPage} con ${numFeatures} elementos. Total: ${totalFeaturesCargadas}`);
                    
                    // Dibujamos el lote en el mapa
                    L.geoJSON(geojsonData, {
                        style: { color: "#3388ff", weight: 3 },
                        onEachFeature: function(feature, layer) {
                            const tags = feature.properties.tags;
                            if (tags && tags.name) {
                                layer.bindPopup(`<b>${tags.name}</b><br>ID: ${feature.properties.id}`);
                            }
                        }
                    }).addTo(map);
                    
                    // Pasamos a la siguiente página
                    currentPage++;
                } else {
                    // Si un lote llega vacío, significa que ya no hay más datos.
                    seguirCargando = false;
                    console.log('Carga completada. No hay más lotes.');
                }

            } catch (error) {
                console.error(`Error al cargar el lote ${currentPage}:`, error);
                loadingText.innerHTML = `<p style="color:red;">Error en lote ${currentPage}: ${error.message}</p>`;
                seguirCargando = false; // Paramos si hay un error
            }
        }
        
        loadingText.textContent = `¡Carga completada! ${totalFeaturesCargadas} calles en el mapa.`;
        setTimeout(() => loadingOverlay.style.display = 'none', 2000);
    }
    
    // --- Seguridad (sin cambios) ---
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