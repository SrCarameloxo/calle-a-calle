// Ruta: /api/getCityStreets.js (Versión 2 - Paginada)

const { createClient } = require('@supabase/supabase-js');

module.exports = async (request, response) => {
    try {
        const supabase = createClient(
            process.env.SUPABASE_URL, 
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Cogemos el número de página de la URL, por defecto será la página 1.
        const page = parseInt(request.query.page) || 1;
        const pageSize = 1000; // Pedimos las calles en lotes de 1000.

        // Llamamos a la función de BD con los parámetros de paginación
        const { data, error } = await supabase.rpc('get_all_ways', {
            page_size: pageSize,
            page_number: page
        });

        if (error) throw error;

        const geojsonData = {
            type: "FeatureCollection",
            features: data.map(row => ({
                type: "Feature",
                geometry: row.geometry,
                properties: { id: row.id, tags: row.tags }
            }))
        };
        
        response.status(200).json(geojsonData);

    } catch (error) {
        console.error('Error en la API getCityStreets:', error.message);
        response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};