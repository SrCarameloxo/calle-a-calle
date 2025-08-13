// --- editor.js ---

document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURACIÓN ---
    // Usamos la clave pública (anon) aquí, porque este código se ejecuta en el navegador.
    const SUPABASE_URL = 'https://hppzwfwtedghpsxfonoh.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcHp3Znd0ZWRnaHBzeGZvbm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMjQzNDMsImV4cCI6MjA2OTcwMDM0M30.BAh6i5iJ5YkDBoydfkC9azAD4eMdYBkEBdxws9kj5Hg';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const loadingOverlay = document.getElementById('loading-overlay');
    
    // --- INICIALIZACIÓN DEL MAPA ---
    const map = L.map('editor-map').setView([38.88, -6.97], 13); // Centrado en Badajoz
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© CARTO',
        maxZoom: 20
    }).addTo(map);

    // --- FUNCIÓN PRINCIPAL PARA CARGAR Y DIBUJAR LAS CALLES ---
    async function cargarCalles() {
        console.log('Pidiendo los datos de las calles a nuestra API...');
        
        try {
            // Hacemos la llamada a nuestra nueva API
            const response = await fetch('/api/getCityStreets');
            if (!response.ok) throw new Error('La respuesta de la API no fue correcta.');
            
            const geojsonData = await response.json();
            console.log(`¡Recibidos ${geojsonData.features.length} elementos! Dibujando en el mapa...`);

            // Usamos L.geoJSON, la forma estándar de Leaflet para dibujar datos GeoJSON
            L.geoJSON(geojsonData, {
                style: function() {
                    // Damos un estilo a las calles
                    return { color: "#3388ff", weight: 3 };
                },
                onEachFeature: function(feature, layer) {
                    // Hacemos que cada calle sea interactiva
                    // Al hacer clic, mostrará un popup con su nombre
                    const tags = feature.properties.tags;
                    if (tags && tags.name) {
                        layer.bindPopup(`<b>${tags.name}</b><br>ID: ${feature.properties.id}`);
                    }
                }
            }).addTo(map);
            
            console.log('¡Mapa dibujado!');
            loadingOverlay.style.display = 'none'; // Ocultamos el mensaje de "Cargando"

        } catch (error) {
            console.error('Error al cargar las calles:', error);
            loadingOverlay.innerHTML = `<p style="color:red;">Error al cargar los datos: ${error.message}</p>`;
        }
    }
    
    // --- SEGURIDAD: Comprobamos si el usuario es admin antes de cargar nada ---
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            if (session) {
                // Si hay sesión, comprobamos el rol
                supabase.from('profiles').select('role').eq('id', session.user.id).single()
                    .then(({ data, error }) => {
                        if (error || !data || data.role !== 'admin') {
                            // Si no es admin, lo redirigimos a la página principal
                            console.log('Acceso denegado. Se requiere rol de administrador.');
                            window.location.href = '/';
                        } else {
                            // ¡Es un admin! Cargamos las calles.
                            console.log('¡Administrador verificado! Iniciando editor...');
                            cargarCalles();
                        }
                    });
            } else {
                // Si no hay sesión, lo mandamos a la página de login.
                window.location.href = '/';
            }
        }
    });
});