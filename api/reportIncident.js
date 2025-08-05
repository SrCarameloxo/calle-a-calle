const { createClient } = require('@supabase/supabase-js');

// Esta función se encarga de recibir un reporte de incidencia de forma segura.
module.exports = async (request, response) => {
    // Solo permitimos que esta función se llame con el método POST.
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }

    try {
        // Leemos la ciudad directamente de la petición, junto con el resto de datos.
        const { zone_points, description, city } = request.body;
        
        // --- Verificación de seguridad: Obtener el usuario a partir del token ---
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            return response.status(401).json({ error: 'Authorization header required' });
        }
        const token = authHeader.split('Bearer ')[1];
        
        // Creamos un cliente de Supabase específico para el servidor
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

        if (userError || !user) {
            return response.status(401).json({ error: 'Invalid or expired token' });
        }
        
        // --- Lógica de la función (ya en un entorno seguro) ---
        
        // El paso de geocodificación inversa se ha eliminado porque ya no es necesario.
        
        // Insertar la incidencia en la base de datos
        const { error: insertError } = await supabaseAdmin.from('incidents').insert({
            user_id: user.id,
            zone_points: zone_points,
            description: description,
            city: city // Usamos la ciudad que nos ha enviado directamente el juego
        });

        if (insertError) {
            throw insertError;
        }

        // Devolver una respuesta de éxito
        return response.status(200).json({ message: 'Incidencia reportada con éxito.' });

    } catch (error) {
        console.error('Error en la API reportIncident:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.' });
    }
};