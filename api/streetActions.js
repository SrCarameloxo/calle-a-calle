// Ruta: /api/streetActions.js (VERSIÓN CON DELETE Y CREATE)

const { createClient } = require('@supabase/supabase-js');
// INICIO: Herramientas añadidas para la caché
const { createClient: createKvClient } = require('@vercel/kv');
const { extractNameParts } = require('../_lib/helpers.js');

const kv = createKvClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
// FIN: Herramientas añadidas para la caché

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
            const { osm_id, cut_point, city } = payload;
            if (!osm_id || !cut_point || !city) return response.status(400).json({ error: 'Faltan datos para la acción de dividir.' });

            // INICIO: Invalidación de Caché (Paso 1: Obtener datos antes de modificar)
            const { data: wayData, error: wayError } = await supabase
                .from('osm_ways')
                .select('tags, city')
                .eq('id', osm_id)
                .single();
            if (wayError) console.error(`Cache Invalidation: No se encontró la calle ${osm_id} para obtener su nombre.`);
            // FIN: Invalidación de Caché (Paso 1)
            
            const cut_point_wkt = `SRID=4326;POINT(${cut_point.lng} ${cut_point.lat})`;
            const { data, error } = await supabase.rpc('split_way_and_hide_original', {
                original_way_id: osm_id,
                cut_point_geom: cut_point_wkt,
                city_name: city
            });
            
            if (error) throw error;

            // INICIO: Invalidación de Caché (Paso 2: Borrar después de operar)
            if (!error && wayData && wayData.tags && wayData.tags.name) {
                const parts = extractNameParts(wayData.tags.name);
                if (parts.baseName) {
                    const cacheKey = `street_v18:${wayData.city}:${parts.baseName.replace(/\s/g, '_')}`;
                    console.log(`Borrando clave de caché por acción 'split': ${cacheKey}`);
                    await kv.del(cacheKey);
                }
            }
            // FIN: Invalidación de Caché (Paso 2)
            
            return response.status(200).json(data);

        } else if (action === 'merge') {
            // --- LÓGICA DE MERGESTREETS ---
            const { ids } = payload;
            if (!ids || !Array.isArray(ids) || ids.length < 2) return response.status(400).json({ error: 'Faltan datos para la acción de unir.' });

            // INICIO: Invalidación de Caché (Paso 1: Obtener datos antes de modificar)
            const { data: waysData, error: waysError } = await supabase
                .from('osm_ways')
                .select('tags, city')
                .in('id', ids);
            if (waysError) console.error(`Cache Invalidation: No se pudieron encontrar las calles originales para unir.`);
            // FIN: Invalidación de Caché (Paso 1)
            
            const { data, error } = await supabase.rpc('union_ways_and_hide_originals', {
                original_way_ids: ids
            });

            if (error) throw error;

            // INICIO: Invalidación de Caché (Paso 2: Borrar después de operar)
            if (!error && waysData && waysData.length > 0) {
                for (const way of waysData) {
                    if (way.tags && way.tags.name) {
                        const parts = extractNameParts(way.tags.name);
                        if (parts.baseName) {
                            const cacheKey = `street_v18:${way.city}:${parts.baseName.replace(/\s/g, '_')}`;
                            console.log(`Borrando clave de caché por acción 'merge': ${cacheKey}`);
                            await kv.del(cacheKey);
                        }
                    }
                }
            }
            // FIN: Invalidación de Caché (Paso 2)

            return response.status(200).json(data[0]);

        } else if (action === 'delete') {
            // --- NUEVA LÓGICA PARA BORRAR ---
            const { id } = payload;
            if (!id) return response.status(400).json({ error: 'Falta el ID para la acción de borrar.' });
            
            // INICIO: Invalidación de Caché (Paso 1: Obtener datos antes de modificar)
            const { data: wayData, error: wayError } = await supabase
                .from('osm_ways')
                .select('tags, city')
                .eq('id', id)
                .single();
            if (wayError) console.error(`Cache Invalidation: No se encontró la calle ${id} para obtener su nombre.`);
            // FIN: Invalidación de Caché (Paso 1)

            const { error } = await supabase
                .from('osm_ways')
                .update({ is_hidden: true })
                .eq('id', id);

            if (error) throw error;

            // INICIO: Invalidación de Caché (Paso 2: Borrar después de operar)
            if (!error && wayData && wayData.tags && wayData.tags.name) {
                const parts = extractNameParts(wayData.tags.name);
                if (parts.baseName) {
                    const cacheKey = `street_v18:${wayData.city}:${parts.baseName.replace(/\s/g, '_')}`;
                    console.log(`Borrando clave de caché por acción 'delete': ${cacheKey}`);
                    await kv.del(cacheKey);
                }
            }
            // FIN: Invalidación de Caché (Paso 2)
            
            return response.status(200).json({ message: `Way ${id} ocultado con éxito.` });

        } else if (action === 'create') {
            // --- LÓGICA DE CREACIÓN CORREGIDA ---
            const { geometry, tags, city } = payload;
            if (!geometry || !tags || !city) return response.status(400).json({ error: 'Faltan datos para la acción de crear.' });

            // --- CÓDIGO PROBLEMÁTICO ELIMINADO ---
            // Se ha borrado el intento de inserción manual con id: -1

            // --- ESTA ES AHORA LA ÚNICA FORMA DE CREAR ---
            // Usamos directamente la función RPC, que es la forma robusta y segura.
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