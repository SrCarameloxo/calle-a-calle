
// Ruta: /api/streetActions.js (VERSIÓN CON CHIVATOS DE DEBUG)

const { createClient } = require('@supabase/supabase-js');

module.exports = async (request, response) => {
    // --- INICIO DE LA MODIFICACIÓN ---
    // Chivato 2: Ver qué datos llegan a la API.
    console.log("--- CHIVATO 2 (Backend) ---");
    console.log("Datos recibidos en el cuerpo de la petición:", request.body);
    // --- FIN DE LA MODIFICACIÓN ---

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
            // ... (código sin cambios)
            const { osm_id, cut_point, city } = payload;
            if (!osm_id || !cut_point || !city) return response.status(400).json({ error: 'Faltan datos para la acción de dividir.' });
            const cut_point_wkt = `SRID=4326;POINT(${cut_point.lng} ${cut_point.lat})`;
            const { data, error } = await supabase.rpc('split_way_and_hide_original', { original_way_id: osm_id, cut_point_geom: cut_point_wkt, city_name: city });
            if (error) throw error;
            return response.status(200).json(data);

        } else if (action === 'merge') {
            // ... (código sin cambios)
            const { ids } = payload;
            if (!ids || !Array.isArray(ids) || ids.length < 2) return response.status(400).json({ error: 'Faltan datos para la acción de unir.' });
            const { data, error } = await supabase.rpc('union_ways_and_hide_originals', { original_way_ids: ids });
            if (error) throw error;
            return response.status(200).json(data[0]);

        } 
        else if (action === 'updateName') {
            const { osm_id, display_name, city } = payload;
            if (!osm_id || !display_name || !city) {
                return response.status(400).json({ error: 'Faltan datos (osm_id, display_name, city) para actualizar.' });
            }

            // --- INICIO DE LA MODIFICACIÓN ---
            // Chivato 3: Confirmar que entramos en el bloque correcto y con qué datos.
            console.log("--- CHIVATO 3 (Backend) ---");
            console.log(`Intentando hacer UPSERT en la tabla 'street_overrides'`);
            console.table({ osm_id, display_name, city });

            const { data, error } = await supabase
                .from('street_overrides')
                .upsert({ 
                    osm_id: osm_id, 
                    display_name: display_name, 
                    city: city 
                }, { onConflict: 'osm_id' }); 
            
            // Chivato 4: Ver la respuesta de Supabase, sea cual sea.
            console.log("--- CHIVATO 4 (Backend) ---");
            console.log("Respuesta de Supabase - Datos:", data);
            console.log("Respuesta de Supabase - Error:", error);
            // --- FIN DE LA MODIFICACIÓN ---

            if (error) throw error; // Si hay un error, la función se detendrá aquí y lo mostrará
            
            return response.status(200).json({ message: 'Nombre de calle actualizado con éxito.' });
        }
        else if (action === 'delete') {
            // ... (código sin cambios)
            const { id } = payload;
            if (!id) return response.status(400).json({ error: 'Falta el ID para la acción de borrar.' });
            const { error } = await supabase.from('osm_ways').update({ is_hidden: true }).eq('id', id);
            if (error) throw error;
            return response.status(200).json({ message: `Way ${id} ocultado con éxito.` });

        } else if (action === 'create') {
            // ... (código sin cambios)
            const { geometry, tags, city } = payload;
            if (!geometry || !tags || !city) return response.status(400).json({ error: 'Faltan datos para la acción de crear.' });
            const { data, error } = await supabase.from('osm_ways').insert({ id: -1, geom: `SRID=4326;${geometry.type.toUpperCase()}(${geometry.coordinates.map(p => p.join(' ')).join(',')})`, tags: tags, city: city }).select('id').single();
            if (error) {
                 const { data: rpcData, error: rpcError } = await supabase.rpc('create_new_way', { geom_geojson: geometry, tags_json: tags, city_name: city }).single();
                 if (rpcError) throw rpcError;
                 return response.status(201).json(rpcData);
            }
            return response.status(201).json(data);

        } else {
            return response.status(400).json({ error: 'Acción no válida o no especificada.' });
        }

    } catch (error) {
        console.error(`Error en /api/streetActions para la acción "${request.body.action}":`, error.message);
        return response.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
};

