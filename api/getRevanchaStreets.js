// Ruta: /api/getCityStreets.js

const { createClient } = require('@supabase/supabase-js');

module.exports = async (request, response) => {
    try {
        const supabase = createClient(
            process.env.SUPABASE_URL, 
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const city = request.query.city;
        if (!city) {
            return response.status(400).json({ error: 'Falta el parámetro "city" en la petición.' });
        }

        const page = parseInt(request.query.page) || 1;
        const pageSize = 1000;

        const { data, error } = await supabase.rpc('get_streets_by_city', {
            city_name: city,
            page_size: pageSize,
            page_number: page
        });

        if (error) throw error;
        
        // --- INICIO: LÓGICA DE DOBLE OVERRIDE ---
        const overrideMap = new Map();

        // 1. Cargar primero las reglas del panel de admin (baja prioridad)
        const { data: oldOverrides } = await supabase
            .from('street_overrides_old')
            .select('osm_id, display_name')
            .eq('city', city);
        if (oldOverrides) {
            for (const rule of oldOverrides) {
                overrideMap.set(rule.osm_id, rule.display_name);
            }
        }

        // 2. Cargar las reglas del editor (alta prioridad, sobreescribirá las anteriores si hay duplicados)
        const { data: newOverrides } = await supabase
            .from('street_overrides')
            .select('osm_id, display_name')
            .eq('city', city);
        if (newOverrides) {
            for (const rule of newOverrides) {
                overrideMap.set(rule.osm_id, rule.display_name);
            }
        }
        // --- FIN: LÓGICA DE DOBLE OVERRIDE ---
        
        const geojsonData = {
            type: "FeatureCollection",
            features: data.map(row => {
                if (overrideMap.has(row.id)) {
                    if (row.tags) {
                        row.tags.name = overrideMap.get(row.id);
                    } else {
                        row.tags = { name: overrideMap.get(row.id) };
                    }
                }
                return {
                    type: "Feature",
                    geometry: row.geometry,
                    properties: { id: row.id, tags: row.tags }
                };
            })
        };
        
        response.status(200).json(geojsonData);

    } catch (error) {
        console.error('Error en la API getCityStreets:', error.message);
        response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};