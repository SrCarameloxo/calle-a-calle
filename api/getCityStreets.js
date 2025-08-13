// Ruta: /api/getCityStreets.js

const { createClient } = require('@supabase/supabase-js');

module.exports = async (request, response) => {
    try {
        // Se conecta a Supabase usando las claves de entorno (más seguro)
        const supabase = createClient(
            process.env.SUPABASE_URL, 
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Llama a la función 'get_all_ways' que creamos en la base de datos
        const { data, error } = await supabase.rpc('get_all_ways');

        if (error) throw error;

        // Devuelve los datos como un FeatureCollection de GeoJSON, que es lo que Leaflet espera
        const geojsonData = {
            type: "FeatureCollection",
            features: data.map(row => ({
                type: "Feature",
                geometry: row.geometry,
                properties: {
                    id: row.id,
                    tags: row.tags
                }
            }))
        };

        // Envía el GeoJSON de vuelta a la página del editor
        response.status(200).json(geojsonData);

    } catch (error) {
        console.error('Error en la API getCityStreets:', error.message);
        response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};