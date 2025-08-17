
// Ruta: /api/getCityStreets.js (Versión 3 - Paginada y por Ciudad)

const { createClient } = require('@supabase/supabase-js');

/*
IMPORTANTE: Para que esta API funcione, necesitas crear o reemplazar la función
en tu base de datos de Supabase. Ve al "SQL Editor" de Supabase y ejecuta esto:

CREATE OR REPLACE FUNCTION get_streets_by_city(city_name text, page_size integer, page_number integer)
RETURNS TABLE(id bigint, geometry json, tags jsonb) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id,
        ST_AsGeoJSON(w.geom)::json AS geometry,
        w.tags
    FROM
        osm_ways AS w
    WHERE
        w.city = city_name AND w.is_hidden = false
    ORDER BY
        w.id
    LIMIT
        page_size
    OFFSET
        (page_number - 1) * page_size;
END;
$$ LANGUAGE plpgsql;

*/

module.exports = async (request, response) => {
    try {
        const supabase = createClient(
            process.env.SUPABASE_URL, 
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // --- INICIO DE LA MODIFICACIÓN ---
        // Cogemos el nombre de la ciudad de la URL. Ahora es obligatorio.
        const city = request.query.city;
        if (!city) {
            return response.status(400).json({ error: 'Falta el parámetro "city" en la petición.' });
        }
        // --- FIN DE LA MODIFICACIÓN ---

        // Cogemos el número de página de la URL, por defecto será la página 1.
        const page = parseInt(request.query.page) || 1;
        const pageSize = 1000; // Pedimos las calles en lotes de 1000.

        // --- INICIO DE LA MODIFICACIÓN ---
        // Llamamos a la nueva función de BD que filtra por ciudad
        const { data, error } = await supabase.rpc('get_streets_by_city', {
            city_name: city, // Le pasamos la ciudad
            page_size: pageSize,
            page_number: page
        });
        // --- FIN DE LA MODIFICACIÓN ---

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

