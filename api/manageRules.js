// RUTA: /api/manageRules.js

const { createClient } = require('@supabase/supabase-js');

// API segura para administradores para gestionar reglas de calles (overrides y blocklist)
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
        // --- 1. Verificación de Seguridad: ¿Es el usuario un administrador? ---
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
            const { data: overrides, error: overridesError } = await supabaseAdmin.from('street_overrides').select('*').order('created_at', { ascending: false });
            if (overridesError) throw overridesError;

            const { data: blocklist, error: blocklistError } = await supabaseAdmin.from('street_blocklist').select('*').order('created_at', { ascending: false });
            if (blocklistError) throw blocklistError;

            return response.status(200).json({ overrides, blocklist });
        }
        
        else if (request.method === 'PUT') {
            const { ruleId, osmName, displayName, city } = request.body;
            if (!ruleId || !osmName || !displayName || !city) {
                 return response.status(400).json({ error: 'Faltan datos para actualizar la regla.' });
            }
            // Por ahora, solo las reglas 'override' son editables de esta forma.
            const { error } = await supabaseAdmin.from('street_overrides')
                .update({ osm_name: osmName, display_name: displayName, city: city })
                .eq('id', ruleId);

            if (error) throw error;
            return response.status(200).json({ message: 'Regla actualizada con éxito.' });
        } 
        
        else if (request.method === 'DELETE') {
            const { ruleId, type } = request.body;
            if (!ruleId || !type) {
                return response.status(400).json({ error: 'Faltan parámetros (ruleId, type).' });
            }
            
            const table = type === 'override' ? 'street_overrides' : 'street_blocklist';
            const { error } = await supabaseAdmin.from(table).delete().eq('id', ruleId);

            if (error) throw error;
            return response.status(200).json({ message: 'Regla eliminada con éxito.' });
        }

    } catch (error) {
        console.error('Error en la API manageRules:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};