// Ruta: /api/streetActions.js

const { createClient } = require('@supabase/supabase-js');
const { createClient: createKvClient } = require('@vercel/kv');
const { extractNameParts } = require('../_lib/helpers.js');

const kv = createKvClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async (request, response) => {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const token = request.headers.authorization?.split('Bearer ')[1];

        if (!token) return response.status(401).json({ error: 'Token no proporcionado.' });
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return response.status(401).json({ error: 'Token inválido.' });
        const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profileError || !profile || profile.role !== 'admin') {
            return response.status(403).json({ error: 'Acceso denegado.' });
        }

        const { action, payload } = request.body;

        if (action === 'split') {
            const { osm_id, cut_point, city } = payload;
            if (!osm_id || !cut_point || !city) return response.status(400).json({ error: 'Faltan datos para dividir.' });
            
            const { data: wayData } = await supabase.from('osm_ways').select('tags, city').eq('id', osm_id).single();
            
            const cut_point_wkt = `SRID=4326;POINT(${cut_point.lng} ${cut_point.lat})`;
            const { data, error } = await supabase.rpc('split_way_and_hide_original', {
                original_way_id: osm_id,
                cut_point_geom: cut_point_wkt,
                city_name: city
            });
            
            if (error) {
                console.error('Error de Supabase al dividir calle (RPC):', error);
                return response.status(500).json({ error: 'Error de base de datos al dividir.', details: error.message });
            }
            
            try {
                if (wayData && wayData.tags && wayData.tags.name) {
                    const parts = extractNameParts(wayData.tags.name);
                    if (parts.baseName) {
                        const cacheKey = `street_v18:${wayData.city}:${parts.baseName.replace(/\s/g, '_')}`;
                        await kv.del(cacheKey);
                    }
                }
            } catch(e) { console.error("Fallo de invalidación de caché en split (no crítico)", e.message); }

            return response.status(200).json(data);

        } else if (action === 'merge') {
            const { ids } = payload;
            if (!ids || !Array.isArray(ids) || ids.length < 2) return response.status(400).json({ error: 'Faltan datos para unir.' });

            const { data: waysData } = await supabase.from('osm_ways').select('tags, city').in('id', ids);
            
            const { data, error } = await supabase.rpc('union_ways_and_hide_originals', { original_way_ids: ids });

            if (error) {
                console.error('Error de Supabase al unir calles (RPC):', error);
                return response.status(500).json({ error: 'Error de base de datos al unir.', details: error.message });
            }

            try {
                if (waysData && waysData.length > 0) {
                    for (const way of waysData) {
                        if (way.tags && way.tags.name) {
                            const parts = extractNameParts(way.tags.name);
                            if (parts.baseName) {
                                const cacheKey = `street_v18:${way.city}:${parts.baseName.replace(/\s/g, '_')}`;
                                await kv.del(cacheKey);
                            }
                        }
                    }
                }
            } catch(e) { console.error("Fallo de invalidación de caché en merge (no crítico)", e.message); }

            return response.status(200).json(data[0]);

        } else if (action === 'delete') {
            const { id } = payload;
            if (!id) return response.status(400).json({ error: 'Falta el ID para borrar.' });
            
            const { data: wayData } = await supabase.from('osm_ways').select('tags, city').eq('id', id).single();
            
            const { error } = await supabase.from('osm_ways').update({ is_hidden: true }).eq('id', id);

            if (error) {
                console.error('Error de Supabase al ocultar calle:', error);
                return response.status(500).json({ error: 'Error de base de datos al ocultar.', details: error.message });
            }

            try {
                if (wayData && wayData.tags && wayData.tags.name) {
                    const parts = extractNameParts(wayData.tags.name);
                    if (parts.baseName) {
                        const cacheKey = `street_v18:${wayData.city}:${parts.baseName.replace(/\s/g, '_')}`;
                        await kv.del(cacheKey);
                    }
                }
            } catch(e) { console.error("Fallo de invalidación de caché en delete (no crítico)", e.message); }
            
            return response.status(200).json({ message: `Way ${id} ocultado.` });

        } else if (action === 'create') {
            const { geometry, tags, city } = payload;
            if (!geometry || !tags || !city) return response.status(400).json({ error: 'Faltan datos para crear.' });

            const { data, error } = await supabase.rpc('create_new_way', {
                 geom_geojson: geometry,
                 tags_json: tags,
                 city_name: city
            }).single();

            if (error) {
                console.error('Error de Supabase al crear calle (RPC):', error);
                return response.status(500).json({ error: 'Error de base de datos al crear.', details: error.message });
            }
            
            return response.status(201).json(data);
            
        } else {
            return response.status(400).json({ error: 'Acción no válida o no especificada.' });
        }

    } catch (error) {
        console.error(`Error catastrófico en streetActions (acción: ${request.body.action}):`, error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};