// Ruta: /api/updateStreetName.js

const { createClient } = require('@supabase/supabase-js');
// --- INICIO DE LA MODIFICACIÓN ---
const { createClient: createKvClient } = require('@vercel/kv');
const { extractNameParts } = require('./_lib/helpers.js');

// Cliente para la caché de Vercel
const kv = createKvClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
// --- FIN DE LA MODIFICACIÓN ---

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


        // --- INICIO DE LA MODIFICACIÓN ---
        // Obtenemos los datos que nos envía el editor.js, incluyendo el nombre original
        const { osm_id, display_name, city, original_osm_name } = request.body;

        if (!osm_id || !display_name || !city || !original_osm_name) {
            return response.status(400).json({ error: 'Faltan datos (osm_id, display_name, city, original_osm_name)' });
        }
        // --- FIN DE LA MODIFICACIÓN ---

        // Usamos 'upsert'
        const { error } = await supabase
            .from('street_overrides')
            .upsert({ 
                osm_id: osm_id, 
                display_name: display_name, 
                city: city 
            }, { onConflict: 'osm_id' });

        if (error) throw error;

        // --- INICIO DE LA MODIFICACIÓN ---
        // Invalidación de la caché después de una actualización exitosa en la BD
        try {
            // Borramos la caché tanto para el nombre antiguo como para el nuevo, por si acaso.
            const oldParts = extractNameParts(original_osm_name);
            if (oldParts.baseName) {
                const oldCacheKey = `street_v18:${city}:${oldParts.baseName.replace(/\s/g, '_')}`;
                await kv.del(oldCacheKey);
                console.log(`Caché limpiada para (antiguo): ${oldCacheKey}`);
            }

            const newParts = extractNameParts(display_name);
            if (newParts.baseName) {
                const newCacheKey = `street_v18:${city}:${newParts.baseName.replace(/\s/g, '_')}`;
                await kv.del(newCacheKey);
                console.log(`Caché limpiada para (nuevo): ${newCacheKey}`);
            }
        } catch (cacheError) {
            // Si la limpieza de caché falla, no rompemos la petición.
            // Simplemente lo registramos y el usuario puede seguir trabajando.
            console.error('Error al limpiar la caché (la actualización de la BD fue exitosa):', cacheError);
            return response.status(200).json({ message: 'Nombre actualizado, pero falló la limpieza de caché.' });
        }
        // --- FIN DE LA MODIFICACIÓN ---

        // --- INICIO DE LA MODIFICACIÓN ---
        // Devolvemos un mensaje de éxito más descriptivo.
        return response.status(200).json({ message: 'Nombre de calle actualizado y caché limpiada con éxito.' });
        // --- FIN DE LA MODIFICACIÓN ---

    } catch (error) {
        console.error('Error en updateStreetName:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};