const { createClient } = require('@supabase/supabase-js');

// Esta API se encarga de obtener la lista de calles que un usuario ha fallado
// para poder jugar en el "Modo Revancha".
module.exports = async (request, response) => {
    // Solo permitimos el método GET
    if (request.method !== 'GET') {
        response.setHeader('Allow', ['GET']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }

    try {
        // --- 1. Verificación de seguridad: Obtener el usuario a partir del token ---
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            return response.status(401).json({ error: 'Authorization header required' });
        }
        const token = authHeader.split('Bearer ')[1];
        
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

        if (userError || !user) {
            return response.status(401).json({ error: 'Invalid or expired token' });
        }
        
        // --- 2. Lógica de la API: Obtener las calles falladas ---
        // La RLS que creaste para SELECT asegura que el usuario solo puede ver sus propias filas.
        const { data, error } = await supabaseAdmin
            .from('calles_falladas_por_usuario')
            .select('osm_name, city, geometries') // Seleccionamos los campos que necesitamos
            .eq('user_id', user.id);

        if (error) {
            throw error;
        }

        // Mapeamos los datos al formato que el frontend espera (googleName, geometries)
        const streets = data.map(calle => ({
            googleName: calle.osm_name, // Renombramos la columna para que sea consistente con el juego
            geometries: calle.geometries,
            city: calle.city
        }));

        // Barajamos la lista para que la partida sea diferente cada vez
        streets.sort(() => Math.random() - 0.5);

        // Devolvemos la lista de calles
        return response.status(200).json({ streets });

    } catch (error) {
        console.error('Error en la API getRevanchaStreets:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};