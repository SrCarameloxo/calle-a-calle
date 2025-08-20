// Ruta: /api/updateStreetName.js

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
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        const token = request.headers.authorization?.split('Bearer ')[1];
        if (!token) return response.status(401).json({ error: 'Token no proporcionado.' });

        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return response.status(401).json({ error: 'Token inválido.' });

        const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profileError || !profile || profile.role !== 'admin') {
            return response.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
        }

        const { osm_id, display_name, city } = request.body;
        if (!osm_id || !display_name || !city) {
            return response.status(400).json({ error: 'Faltan datos (osm_id, display_name, city)' });
        }

        const { error: upsertError } = await supabase
            .from('street_overrides')
            .upsert({ 
                osm_id: osm_id, 
                display_name: display_name, 
                city: city 
            }, { onConflict: 'osm_id' });

        if (upsertError) {
            // Si hay un error aquí (ej. RLS), lo devolvemos como JSON
            console.error('Error de Supabase al hacer upsert en street_overrides:', upsertError);
            return response.status(500).json({ error: 'Error de base de datos.', details: upsertError.message });
        }

        try {
            const { data: wayData } = await supabase
                .from('osm_ways')
                .select('tags')
                .eq('id', osm_id)
                .single();
            
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
            console.error('Error al invalidar la caché en updateStreetName (no crítico):', cacheError.message);
        }

        return response.status(200).json({ message: 'Nombre de calle actualizado con éxito.' });
        
    } catch (error) {
        console.error('Error catastrófico en updateStreetName:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};