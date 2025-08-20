// Ruta: /api/updateStreetName.js

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
    // Solo permitimos peticiones POST
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        // Verificamos que el usuario es un admin
        const token = request.headers.authorization.split('Bearer ')[1];
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user) throw new Error('Invalid token');

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (!profile || profile.role !== 'admin') throw new Error('Admin access required');


        // Obtenemos los datos que nos envía el editor.js
        const { osm_id, display_name, city } = request.body;

        if (!osm_id || !display_name || !city) {
            return response.status(400).json({ error: 'Faltan datos (osm_id, display_name, city)' });
        }

        // Usamos 'upsert'
        const { error } = await supabase
            .from('street_overrides')
            .upsert({ 
                osm_id: osm_id, 
                display_name: display_name, 
                city: city 
            }, { onConflict: 'osm_id' });

        if (error) throw error;

        // --- INICIO: LÓGICA DE INVALIDACIÓN DE CACHÉ AÑADIDA ---
        try {
            // Para invalidar la caché, necesitamos el nombre OSM original, no el nuevo.
            // Lo buscamos en nuestra tabla principal usando el ID.
            const { data: wayData, error: wayError } = await supabase
                .from('osm_ways')
                .select('tags')
                .eq('id', osm_id)
                .single();

            if (wayError) throw new Error(`No se encontró la calle original para invalidar caché: ${wayError.message}`);

            if (wayData && wayData.tags && wayData.tags.name) {
                const osmName = wayData.tags.name;
                const parts = extractNameParts(osmName);
                if (parts.baseName) {
                    const cacheKey = `street_v18:${city}:${parts.baseName.replace(/\s/g, '_')}`;
                    console.log(`Borrando clave de caché por cambio de nombre: ${cacheKey}`);
                    await kv.del(cacheKey);
                }
            }
        } catch (cacheError) {
            // Si falla el borrado de caché, no rompemos la operación.
            // Simplemente lo registramos para saber que ha ocurrido.
            console.error('Error al invalidar la caché en updateStreetName:', cacheError.message);
        }
        // --- FIN: LÓGICA DE INVALIDACIÓN DE CACHÉ AÑADIDA ---

        return response.status(200).json({ message: 'Nombre de calle actualizado con éxito.' });

    } catch (error) {
        console.error('Error en updateStreetName:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};