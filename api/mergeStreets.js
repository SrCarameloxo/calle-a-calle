// Ruta: /api/mergeStreets.js

const { createClient } = require('@supabase/supabase-js');

module.exports = async (request, response) => {
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // --- 1. Seguridad: Verificar que el usuario es un administrador ---
        const token = request.headers.authorization?.split('Bearer ')[1];
        if (!token) return response.status(401).json({ error: 'Authentication token not provided.' });
        
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return response.status(401).json({ error: 'Invalid or expired token.' });

        const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profileError || !profile || profile.role !== 'admin') {
            return response.status(403).json({ error: 'Forbidden: Admin access is required.' });
        }

        // --- 2. Lógica de la API ---
        const { ids } = request.body;
        if (!ids || !Array.isArray(ids) || ids.length < 2) {
            return response.status(400).json({ error: 'Se requiere un array con al menos dos IDs de calles para unir.' });
        }

        // Llamamos a nuestra nueva función SQL
        const { data: newWay, error: rpcError } = await supabase.rpc('merge_ways_and_hide_originals', {
            original_way_ids: ids
        });

        if (rpcError) {
            return response.status(400).json({ error: 'Error al unir las calles.', details: rpcError.message });
        }

        // La RPC devuelve un array, pero sabemos que solo contiene la nueva calle creada.
        // Devolvemos solo ese objeto para simplificar el trabajo en el frontend.
        return response.status(200).json(newWay[0]);

    } catch (error) {
        console.error('Error en /api/mergeStreets:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
};