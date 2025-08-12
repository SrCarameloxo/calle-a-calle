const { createClient } = require('@supabase/supabase-js');

// Esta API se encarga de eliminar una calle de la lista de fallos de un usuario.
module.exports = async (request, response) => {
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }

    try {
        // --- 1. Seguridad: Obtener el usuario desde el token ---
        const authHeader = request.headers.authorization;
        if (!authHeader) return response.status(401).json({ error: 'Authorization header required' });
        const token = authHeader.split('Bearer ')[1];
        
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) return response.status(401).json({ error: 'Invalid token' });

        // --- 2. Lógica: Eliminar el fallo ---
        const { osm_name } = request.body;
        if (!osm_name) {
            return response.status(400).json({ error: 'Falta el nombre de la calle a eliminar.' });
        }

        // La RLS de DELETE que creaste asegura que un usuario solo puede borrar sus propias filas.
        const { error } = await supabaseAdmin
            .from('calles_falladas_por_usuario')
            .delete()
            .match({ user_id: user.id, osm_name: osm_name });

        if (error) throw error;

        return response.status(200).json({ message: 'Calle eliminada de la lista de revancha.' });

    } catch (error) {
        console.error('Error en deleteFailure:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};