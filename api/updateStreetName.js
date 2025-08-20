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
        
        const token = request.headers.authorization.split('Bearer ')[1];
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user) throw new Error('Invalid token');

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (!profile || profile.role !== 'admin') throw new Error('Admin access required');

        const { osm_id, display_name, city } = request.body;
        if (!osm_id || !display_name || !city) {
            return response.status(400).json({ error: 'Faltan datos (osm_id, display_name, city)' });
        }

        // CORRECTO: Escribimos en la tabla del editor 'street_overrides'
        const { error } = await supabase
            .from('street_overrides')
            .upsert({ 
                osm_id: osm_id, 
                display_name: display_name, 
                city: city 
            }, { onConflict: 'osm_id' });

        if (error) throw error;

        // La lógica de invalidación de caché sigue siendo correcta
        try {
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
            console.error('Error al invalidar la caché en updateStreetName:', cacheError.message);
        }

        return response.status(200).json({ message: 'Nombre de calle actualizado con éxito.' });
    } catch (error) {
        console.error('Error en updateStreetName:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};