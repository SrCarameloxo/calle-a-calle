// Ruta: /api/splitStreet.js

const { createClient } = require('@supabase/supabase-js');

module.exports = async (request, response) => {
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // --- 1. Seguridad: Verificar que el usuario es un administrador ---
        const token = request.headers.authorization?.split('Bearer ')[1];
        if (!token) {
            return response.status(401).json({ error: 'Authentication token not provided.' });
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
            return response.status(401).json({ error: 'Invalid or expired token.' });
        }

        const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profileError || !profile || profile.role !== 'admin') {
            return response.status(403).json({ error: 'Forbidden: Admin access is required.' });
        }

        // --- 2. Lógica de la API ---
        const { osm_id, cut_point, city } = request.body;
        if (!osm_id || !cut_point || !city) {
            return response.status(400).json({ error: 'Faltan datos requeridos (osm_id, cut_point, city).' });
        }

        // <-- ESTA ES LA LÍNEA CORREGIDA -->
        // Le decimos a PostGIS que el punto que creamos está en el sistema de coordenadas 4326.
        const cut_point_wkt = `SRID=4326;POINT(${cut_point.lng} ${cut_point.lat})`;

        // Llamamos a nuestra función SQL "mágica"
        const { data: newWays, error: rpcError } = await supabase.rpc('split_way_and_hide_original', {
            original_way_id: osm_id,
            cut_point_geom: cut_point_wkt,
            city_name: city
        });

        if (rpcError) {
            // Pasamos el error de la base de datos al cliente para que sepa qué pasó
            return response.status(400).json({ error: 'Error al dividir la calle.', details: rpcError.message });
        }

        // Devolvemos las dos nuevas calles al frontend
        return response.status(200).json(newWays);

    } catch (error) {
        console.error('Error en /api/splitStreet:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
};