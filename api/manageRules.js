const { createClient } = require('@supabase/supabase-js');
const { createClient: createKvClient } = require('@vercel/kv');
const { extractNameParts } = require('./_lib/helpers.js');

// Cliente para la caché
const kv = createKvClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async (request, response) => {
    if (!['GET', 'PUT', 'DELETE'].includes(request.method)) {
        response.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }

    const supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        // --- 1. Verificación de Seguridad ---
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            return response.status(401).json({ error: 'Authorization header required' });
        }
        const token = authHeader.split('Bearer ')[1];
        
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) {
            return response.status(401).json({ error: 'Invalid or expired token' });
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || !profile || profile.role !== 'admin') {
            return response.status(403).json({ error: 'Forbidden: Admin access required.' });
        }

        // --- 2. Lógica de la API (El usuario ya está verificado como admin) ---
        if (request.method === 'GET') {
            const { data: overrides, error: overridesError } = await supabaseAdmin.from('street_overrides_old').select('*').order('created_at', { ascending: false });
            if (overridesError) throw overridesError;

            const { data: blocklist, error: blocklistError } = await supabaseAdmin.from('street_blocklist').select('*').order('created_at', { ascending: false });
            if (blocklistError) throw blocklistError;

            return response.status(200).json({ overrides, blocklist });
        }
        
        else if (request.method === 'PUT') {
            const { ruleId, osmName, displayName, city, oldOsmName } = request.body;
            if (!ruleId || !osmName || !displayName || !city || !oldOsmName) {
                 return response.status(400).json({ error: 'Faltan datos para actualizar la regla.' });
            }
            
            // CORREGIDO: Usamos la tabla correcta 'street_overrides_old'
            const { error: updateError } = await supabaseAdmin.from('street_overrides_old')
                .update({ osm_name: osmName, display_name: displayName, city: city })
                .eq('id', ruleId);
            if (updateError) throw updateError;
            
            // --- INICIO: Invalidación de caché ---
            // Borramos la caché tanto para el nombre antiguo como para el nuevo, por si acaso.
            const oldParts = extractNameParts(oldOsmName);
            if (oldParts.baseName) {
                const oldCacheKey = `street_v18:${city}:${oldParts.baseName.replace(/\s/g, '_')}`;
                await kv.del(oldCacheKey);
            }
            const newParts = extractNameParts(osmName);
            if (newParts.baseName) {
                const newCacheKey = `street_v18:${city}:${newParts.baseName.replace(/\s/g, '_')}`;
                await kv.del(newCacheKey);
            }
            // --- FIN: Invalidación de caché ---

            return response.status(200).json({ message: 'Regla actualizada con éxito y caché limpiada.' });
        } 
        
        else if (request.method === 'DELETE') {
            const { ruleId, type, osmName, city } = request.body;
            if (!ruleId || !type || !osmName || !city) {
                return response.status(400).json({ error: 'Faltan parámetros para eliminar.' });
            }
            
            // CORREGIDO: Usamos la tabla correcta 'street_overrides_old'
            const table = type === 'override' ? 'street_overrides_old' : 'street_blocklist';
            const { error } = await supabaseAdmin.from(table).delete().eq('id', ruleId);
            if (error) throw error;
            
            // --- INICIO: Invalidación de caché ---
            const parts = extractNameParts(osmName);
            if (parts.baseName) {
                const cacheKey = `street_v18:${city}:${parts.baseName.replace(/\s/g, '_')}`;
                await kv.del(cacheKey);
            }
            // --- FIN: Invalidación de caché ---

            return response.status(200).json({ message: 'Regla eliminada con éxito y caché limpiada.' });
        }

    } catch (error) {
        console.error('Error en la API manageRules:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};