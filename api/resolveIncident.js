import { createClient } from '@supabase/supabase-js';

// Esta API segura solo puede ser llamada por administradores.
// Su trabajo es actualizar una incidencia y, si es necesario, crear una regla de anulación.
export default async function handler(request, response) {
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
        const authHeader = request.headers.get('authorization');
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
        const { incidentId, action, osmName, displayName, city } = request.body;
        
        if (!incidentId || !action) {
            return response.status(400).json({ error: 'Faltan parámetros (incidentId, action).' });
        }

        if (action === 'approve') {
            if (!osmName || !displayName || !city) {
                return response.status(400).json({ error: 'Para aprobar, se requieren osmName, displayName y city.' });
            }
            // Insertamos la nueva regla en la tabla de excepciones
            const { error: overrideError } = await supabaseAdmin.from('street_overrides').insert({
                osm_name: osmName,
                display_name: displayName,
                city: city,
            });
            if (overrideError) throw overrideError;
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
}