import { createClient } from '@supabase/supabase-js';

// Esta función se encarga de recibir un reporte de incidencia de forma segura.
export default async function handler(request, response) {
    // Solo permitimos que esta función se llame con el método POST.
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }

    try {
        const { zone_points, description } = request.body;
        
        // --- Verificación de seguridad: Obtener el usuario a partir del token ---
        const authHeader = request.headers.get('authorization');
        if (!authHeader) {
            return response.status(401).json({ error: 'Authorization header required' });
        }
        const token = authHeader.split('Bearer ')[1];
        
        // Creamos un cliente de Supabase específico para el servidor, usando la clave de servicio
        // que SÍ se puede usar de forma segura en el backend.
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: { user }, error: userError } = await import { createClient } from '@supabase/supabase-js';

// Esta función se encarga de recibir un reporte de incidencia de forma segura.
export default async function handler(request, response) {
    // Solo permitimos que esta función se llame con el método POST.
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }

    try {
        const { zone_points, description } = request.body;
        
        // --- Verificación de seguridad: Obtener el usuario a partir del token ---
        const authHeader = request.headers.get('authorization');
        if (!authHeader) {
            return response.status(401).json({ error: 'Authorization header required' });
        }
        const token = authHeader.split('Bearer ')[1];
        
        // Creamos un cliente de Supabase específico para el servidor, usando la clave de servicio
        // que SÍ se puede usar de forma segura en el backend.
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

        if (userError || !user) {
            return response.status(401).json({ error: 'Invalid or expired token' });
        }
        
        // --- Lógica de la función (ya en un entorno seguro) ---
        
        // 1. Obtener la ciudad haciendo geocodificación inversa
        const centerPointString = zone_points.split(';')[0];
        const [lat, lng] = centerPointString.split(',');
        const apiKey = process.env.GOOGLE_API_KEY;

        const geoResponse = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`);
        const geoData = await geoResponse.json();
        
        let city = null;
        if (geoData.results && geoData.results[0]) {
            const addressComponents = geoData.results[0].address_components;
            const cityComponent = addressComponents.find(c => c.types.includes('locality'));
            if (cityComponent) {
                city = cityComponent.long_name;
            }
        }
        
        // 2. Insertar la incidencia en la base de datos
        const { error: insertError } = await supabaseAdmin.from('incidents').insert({
            user_id: user.id,
            zone_points: zone_points,
            description: description,
            city: city 
        });

        if (insertError) {
            throw insertError;
        }

        // 3. Devolver una respuesta de éxito
        return response.status(200).json({ message: 'Incidencia reportada con éxito.' });

    } catch (error) {
        console.error('Error en la API reportIncident:', error.message);
        return response.status(500).json({ error: 'Error interno del servidor.' });
    }
}