// Ruta: /api/updateStreetName.js

const { createClient } = require('@supabase/supabase-js');

module.exports = async (request, response) => {
    // Solo permitimos peticiones POST
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        // Verificamos que el usuario es un admin
        const token = request.headers.authorization.split('Bearer ')[1];
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user) throw new Error('Invalid token');

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (!profile || profile.role !== 'admin') throw new Error('Admin access required');


        // Obtenemos los datos que nos envía el editor.js
        const { osm_id, display_name, city } = request.body;

        if (!osm_id || !display_name || !city) {
            return response.status(400).json({ error: 'Faltan datos (osm_id, display_name, city)' });
        }

        // Usamos 'upsert'
        const { error } = await supabase
            .from('street_overrides')
            .upsert({ 
                osm_id: osm_id, 
                display_name: display_name, 
                city: city 
            }, { onConflict: 'osm_id' });

        if (error) throw error;

        return response.status(200).json({ message: 'Nombre de calle actualizado con éxito.' });

    } catch (error) {
        console.error('Error en updateStreetName:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};