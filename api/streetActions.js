// Ruta: /api/streetActions.js (VERSIÓN CON DELETE Y CREATE)

const { createClient } = require('@supabase/supabase-js');
// --- INICIO DE LA MODIFICACIÓN ---
const { createClient: createKvClient } = require('@vercel/kv');
const { extractNameParts } = require('./_lib/helpers.js');

// Cliente para la caché
const kv = createKvClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
// --- FIN DE LA MODIFICACIÓN ---

module.exports = async (request, response) => {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const token = request.headers.authorization?.split('Bearer ')[1];

        // 1. Seguridad (común para todas las acciones)
        if (!token) return response.status(401).json({ error: 'Token no proporcionado.' });
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return response.status(401).json({ error: 'Token inválido.' });
        const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profileError || !profile || profile.role !== 'admin') {
            return response.status(403).json({ error: 'Acceso denegado.' });
        }

        // 2. Lógica de enrutamiento basada en la acción
        const { action, payload } = request.body;

        if (action === 'split') {
            // --- LÓGICA DE SPLITSTREET ---
            // --- INICIO DE LA MODIFICACIÓN ---
            const { osm_id, cut_point, city, osm_name } = payload;
            if (!osm_id || !cut_point || !city || !osm_name) return response.status(400).json({ error: 'Faltan datos para la acción de dividir (osm_id, cut_point, city, osm_name).' });
            // --- FIN DE LA MODIFICACIÓN ---
            
            const cut_point_wkt = `SRID=4326;POINT(${cut_point.lng} ${cut_point.lat})`;
            const { data, error } = await supabase.rpc('split_way_and_hide_original', {
                original_way_id: osm_id,
                cut_point_geom: cut_point_wkt,
                city_name: city
            });
            
            if (error) throw error;
            
            // --- INICIO DE LA MODIFICACIÓN ---
            // Invalidar la caché de la calle original que se ha ocultado
            const parts = extractNameParts(osm_name);
            if (parts.baseName) {
                const cacheKey = `street_v18:${city}:${parts.baseName.replace(/\s/g, '_')}`;
                await kv.del(cacheKey);
                console.log(`Caché limpiada para calle dividida (original): ${cacheKey}`);
            }
            return response.status(200).json({ new_ways: data, message: 'Calle dividida y caché limpiada.' });
            // --- FIN DE LA MODIFICACIÓN ---

        } else if (action === 'merge') {
            // --- LÓGICA DE MERGESTREETS ---
            // --- INICIO DE LA MODIFICACIÓN ---
            const { streets_to_merge } = payload;
            if (!streets_to_merge || !Array.isArray(streets_to_merge) || streets_to_merge.length < 2) return response.status(400).json({ error: 'Faltan datos para la acción de unir (se requiere un array streets_to_merge).' });
            
            const ids = streets_to_merge.map(s => s.id);
            // --- FIN DE LA MODIFICACIÓN ---

            const { data, error } = await supabase.rpc('union_ways_and_hide_originals', {
                original_way_ids: ids
            });

            if (error) throw error;
            
            // --- INICIO DE LA MODIFICACIÓN ---
            // Invalidar la caché para CADA una de las calles originales que se han unido y ocultado
            for (const street of streets_to_merge) {
                const parts = extractNameParts(street.osm_name);
                if (parts.baseName) {
                    const cacheKey = `street_v18:${street.city}:${parts.baseName.replace(/\s/g, '_')}`;
                    await kv.del(cacheKey);
                    console.log(`Caché limpiada para calle unida (original): ${cacheKey}`);
                }
            }
            return response.status(200).json({ new_way: data[0], message: 'Calles unidas y cachés limpiadas.' });
            // --- FIN DE LA MODIFICACIÓN ---

        } else if (action === 'delete') {
            const { id, osm_name, city } = payload;

            // --- INICIO DE LA MODIFICACIÓN: VALIDACIÓN FLEXIBLE ---
            // Ahora solo exigimos el ID, que es lo único indispensable para la base de datos.
            if (!id) return response.status(400).json({ error: 'Falta el ID para la acción de borrar.' });
            // --- FIN DE LA MODIFICACIÓN ---
            
            const { error } = await supabase
                .from('osm_ways')
                .update({ is_hidden: true })
                .eq('id', id);

            if (error) throw error;
            
            let message = `Way ${id} ocultado con éxito.`;

            // --- INICIO DE LA MODIFICACIÓN: LIMPIEZA DE CACHÉ CONDICIONAL ---
            // La limpieza de caché solo se ejecuta si la calle tenía nombre y ciudad.
            if (osm_name && city) {
                const parts = extractNameParts(osm_name);
                if (parts.baseName) {
                    const cacheKey = `street_v18:${city}:${parts.baseName.replace(/\s/g, '_')}`;
                    await kv.del(cacheKey);
                    console.log(`Caché limpiada para calle borrada: ${cacheKey}`);
                    message = `Way ${id} ocultado y caché limpiada con éxito.`;
                }
            }
            // --- FIN DE LA MODIFICACIÓN ---

            return response.status(200).json({ message });

        } else if (action === 'create') {
            // --- NUEVA LÓGICA PARA CREAR ---
            const { geometry, tags, city } = payload;
            if (!geometry || !tags || !city) return response.status(400).json({ error: 'Faltan datos para la acción de crear.' });

            const { data: rpcData, error: rpcError } = await supabase.rpc('create_new_way', {
                 geom_geojson: geometry,
                 tags_json: tags,
                 city_name: city
             }).single();

             if (rpcError) throw rpcError;
             return response.status(201).json(rpcData);

        } else {
            return response.status(400).json({ error: 'Acción no válida o no especificada.' });
        }

    } catch (error) {
        console.error(`Error en /api/streetActions para la acción "${request.body.action}":`, error.message);
        return response.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
};