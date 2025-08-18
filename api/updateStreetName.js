
// Ruta: /api/updateStreetName.js (VERSIÓN DE DEPURACIÓN PRECISA)

const { createClient } = require('@supabase/supabase-js');

module.exports = async (request, response) => {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        console.log("--- CHIVATO [API] --- Petición recibida en updateStreetName.js");
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            console.error("--- CHIVATO [API] ERROR --- No se encontró la cabecera de autorización.");
            throw new Error('Authorization header required');
        }
        
        const token = authHeader.split('Bearer ')[1];
        console.log("--- CHIVATO [API] --- Token extraído.");

        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
            console.error("--- CHIVATO [API] ERROR --- El token es inválido o ha expirado.", userError);
            throw new Error('Invalid token');
        }
        console.log("--- CHIVATO [API] --- Usuario verificado:", user.id);

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (!profile || profile.role !== 'admin') {
            console.error("--- CHIVATO [API] ERROR --- El usuario no es administrador. Rol:", profile?.role);
            throw new Error('Admin access required');
        }
        console.log("--- CHIVATO [API] --- El usuario es administrador.");

        const { osm_id, display_name, city } = request.body;
        console.log("--- CHIVATO [API] --- Datos del cuerpo recibidos:", { osm_id, display_name, city });

        if (!osm_id || !display_name || !city) {
            return response.status(400).json({ error: 'Faltan datos (osm_id, display_name, city)' });
        }

        const supabaseResponse = await supabase
            .from('street_overrides')
            .upsert({ 
                osm_id: osm_id, 
                display_name: display_name, 
                city: city 
            }, { onConflict: 'osm_id' });

        console.log("--- CHIVATO [API] --- Respuesta COMPLETA de Supabase:");
        console.log("Status:", supabaseResponse.status);
        console.log("Count (filas afectadas):", supabaseResponse.count);
        console.log("Error Object:", supabaseResponse.error);
        
        if (supabaseResponse.error) {
            throw supabaseResponse.error;
        }

        return response.status(200).json({ message: 'Nombre de calle actualizado con éxito.' });

    } catch (error) {
        console.error('Error en updateStreetName:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};
