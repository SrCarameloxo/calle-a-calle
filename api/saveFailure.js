const { createClient } = require('@supabase/supabase-js');

// Esta API se encarga de guardar una calle que un usuario ha fallado.
module.exports = async (request, response) => {
    // Solo permitimos que esta función se llame con el método POST.
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }

    try {
        // --- 1. Verificación de seguridad: Obtener el usuario a partir del token ---
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            return response.status(401).json({ error: 'Authorization header required' });
        }
        const token = authHeader.split('Bearer ')[1];
        
        // Creamos un cliente de Supabase con permisos de administrador para el servidor
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

        if (userError || !user) {
            return response.status(401).json({ error: 'Invalid or expired token' });
        }
        
        // --- 2. Lógica de la función: Guardar el fallo ---
        const { osm_name, city, geometries } = request.body;
        
        if (!osm_name || !city || !geometries) {
            return response.status(400).json({ error: 'Faltan datos (osm_name, city, geometries) para guardar el fallo.' });
        }

        // Usamos 'upsert' para evitar duplicados. Si el usuario ya ha fallado esta calle
        // anteriormente, la entrada simplemente se actualiza (o no hace nada), pero no se duplica.
        // La RLS de INSERT que creaste en Supabase permite esta operación.
        const { error: insertError } = await supabaseAdmin.from('calles_falladas_por_usuario').upsert({
            user_id: user.id,
            osm_name: osm_name,
            city: city,
            geometries: geometries, // Guardamos la geometría para poder jugarla en el futuro
            // created_at es gestionado automáticamente por Supabase
        }, { 
            onConflict: 'user_id, osm_name' // Clave única para evitar duplicados
        });

        if (insertError) {
            throw insertError;
        }

        // Devolvemos una respuesta de éxito
        return response.status(200).json({ message: 'Fallo registrado con éxito para el modo revancha.' });

    } catch (error) {
        console.error('Error en la API saveFailure:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};