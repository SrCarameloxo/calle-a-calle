const { createClient } = require('@supabase/supabase-js');
const { createClient: createKvClient } = require('@vercel/kv');
const { extractNameParts } = require('./_lib/helpers.js');

// Cliente para la caché de Vercel
const kv = createKvClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Esta API segura solo puede ser llamada por administradores.
// Su trabajo es actualizar una incidencia y, si es necesario, crear una regla de anulación o bloqueo.
module.exports = async (request, response) => {
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
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

        // --- 2. Lógica de la Función (El usuario ya está verificado como admin) ---
        // Se añade 'actionType' para diferenciar entre 'override' y 'block'
        const { incidentId, action, osmName, displayName, city, actionType } = request.body;
        
        if (!incidentId || !action) {
            return response.status(400).json({ error: 'Faltan parámetros (incidentId, action).' });
        }

        if (action === 'approve') {
            if (!osmName || !city || !actionType) {
                return response.status(400).json({ error: 'Para aprobar, se requieren osmName, city y actionType.' });
            }

            // --- INICIO DE LA LÓGICA MODIFICADA ---
            if (actionType === 'override') {
                if (!displayName) {
                    return response.status(400).json({ error: 'Para la acción "override", se requiere displayName.' });
                }
                // Insertamos la nueva regla en la tabla de excepciones
                const { error: overrideError } = await supabaseAdmin.from('street_overrides_old').insert({
                    osm_name: osmName,
                    display_name: displayName,
                    city: city,
                });
                if (overrideError) throw overrideError;

            } else if (actionType === 'block') {
                // Insertamos la nueva regla en la tabla de bloqueo
                const { error: blockError } = await supabaseAdmin.from('street_blocklist').insert({
                    osm_name: osmName,
                    city: city,
                });
                if (blockError) throw blockError;
            } else {
                return response.status(400).json({ error: 'actionType no válido. Debe ser "override" o "block".' });
            }
            // --- FIN DE LA LÓGICA MODIFICADA ---

            // --- INICIO: Invalidación de caché ---
            // Una vez guardada la regla, borramos la caché para que el cambio se refleje.
            const parts = extractNameParts(osmName);
            if (parts.baseName) {
                const cacheKey = `street_v18:${city}:${parts.baseName.replace(/\s/g, '_')}`;
                await kv.del(cacheKey);
            }
            // --- FIN: Invalidación de caché ---
        }

        // 3. Actualizamos el estado de la incidencia a 'resuelta' o 'rechazada'
        const newStatus = action === 'approve' ? 'resuelta' : 'rechazada';
        const { error: updateError } = await supabaseAdmin
            .from('incidents')
            .update({ status: newStatus })
            .eq('id', incidentId);
        
        if (updateError) throw updateError;
        
        return response.status(200).json({ message: `Incidencia ${incidentId} marcada como ${newStatus}.` });

    } catch (error) {
        console.error('Error en la API resolveIncident:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};