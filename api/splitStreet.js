// Ruta: /api/splitStreet.js

const { createClient } = require('@supabase/supabase-js');

module.exports = async (request, response) => {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method Not Allowed' });

    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        // ... (Aquí iría la misma lógica de seguridad para verificar que eres admin) ...

        const { osm_id, cut_point, city } = request.body;
        if (!osm_id || !cut_point || !city) {
            return response.status(400).json({ error: 'Faltan datos' });
        }

        // Convertimos las coordenadas del punto de corte al formato que PostGIS entiende
        const cut_point_geom = `POINT(${cut_point.lng} ${cut_point.lat})`;

        // Llamamos a nuestra función SQL "mágica"
        const { data, error } = await supabase.rpc('split_way_and_hide_original', {
            original_way_id: osm_id,
            cut_point_geom: cut_point_geom,
            city_name: city
        });

        if (error) throw error;

        return response.status(200).json({ success: true, new_ways: data });

    } catch (error) {
        console.error('Error en splitStreet:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
};