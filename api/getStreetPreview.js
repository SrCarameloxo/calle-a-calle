// RUTA: /api/getStreetPreview.js

const { createClient } = require('@supabase/supabase-js');

// API para obtener la geometría de una calle específica para previsualización.
module.exports = async (request, response) => {
    if (request.method !== 'GET') {
        response.setHeader('Allow', ['GET']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }
     
    const supabaseAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        // --- 1. Verificación de Seguridad (similar a las otras APIs de admin) ---
        const authHeader = request.headers.authorization;
        if (!authHeader) return response.status(401).json({ error: 'Authorization header required' });
        const token = authHeader.split('Bearer ')[1];
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) return response.status(401).json({ error: 'Invalid or expired token' });
        const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
        if (profileError || !profile || profile.role !== 'admin') return response.status(403).json({ error: 'Forbidden: Admin access required.' });
        
        // --- 2. Lógica de la API ---
        const { osmName, city } = request.query;
        if (!osmName || !city) {
            return response.status(400).json({ error: 'Faltan parámetros (osmName, city).' });
        }

        // Obtener coordenadas de la ciudad para centrar la búsqueda en Overpass
        const { data: cityData, error: cityError } = await supabaseAdmin
            .from('cities')
            .select('center_lat, center_lng')
            .eq('name', city)
            .single();
        
        if (cityError || !cityData) {
            return response.status(404).json({ error: `No se encontraron coordenadas para la ciudad: ${city}. La búsqueda no es posible.`});
        }
        
        const center = { lat: cityData.center_lat, lng: cityData.center_lng };
        const radius = 20000; // Un radio grande (20km) para asegurar encontrar la calle

        const queryName = osmName.replace(/"/g, '\\"'); // Escapar comillas en el nombre
        const geometryQuery = `[out:json][timeout:25]; way["name"="${queryName}"](around:${radius}, ${center.lat}, ${center.lng}); out body; >; out skel qt;`;
        
        const overpassResponse = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: geometryQuery });
        if (!overpassResponse.ok) throw new Error(`Overpass API error: ${overpassResponse.statusText}`);
        
        const geomData = await overpassResponse.json();
        
        const elementsById = geomData.elements.reduce((acc, el) => { acc[el.id] = el; return acc; }, {});
        const geometries = geomData.elements
            .filter(el => el.type === 'way')
            .map(el => ({
                points: (el.nodes || []).map(id => elementsById[id]).filter(Boolean).map(n => [n.lat, n.lon]),
                isClosed: (el.nodes || []).length > 2 && el.nodes[0] === el.nodes[el.nodes.length - 1]
            }))
            .filter(g => g.points.length > 1);
        
        return response.status(200).json({ geometries });

    } catch (error) {
        console.error('Error en la API getStreetPreview:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
};