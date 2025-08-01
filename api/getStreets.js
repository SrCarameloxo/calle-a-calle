// api/getStreets.js con depuración
import { createClient } from '@vercel/kv';

// ... (las funciones geocode y extractNameParts no cambian, las omito aquí por brevedad, pero déjalas en tu archivo)
// ...

export default async function handler(request, response) {
  console.log("Iniciando /api/getStreets");
  const { zonePoints } = request.body;
  if (!zonePoints || zonePoints.length < 3) {
    console.error("Error: Faltan puntos de la zona.");
    return response.status(400).json({ error: 'Faltan los puntos de la zona.' });
  }

  try {
    const coords = zonePoints.map(p => `${p.lat} ${p.lng}`).join(' ');
    let overpassUrl = 'https://overpass-api.de/api/interpreter';
    
    // --- Primer fetch a Overpass ---
    let query = `[out:json][timeout:25]; way(poly:"${coords}")["name"]; out tags;`;
    console.log("Llamando a Overpass (paso 1) con URL:", overpassUrl);
    let res = await fetch(overpassUrl, { method: 'POST', body: query });
    console.log("Respuesta de Overpass (paso 1) OK:", res.ok);
    if (!res.ok) throw new Error(`Overpass API error 1: ${res.statusText}`);
    let js = await res.json();
    const streetNamesInPoly = new Set(js.elements.map(el => el.tags.name));
    console.log(`Encontrados ${streetNamesInPoly.size} nombres de calles en Overpass.`);
    
    let streetList = [];
    const seenGoogleNames = new Set();
    const center = { lat: zonePoints[0].lat, lng: zonePoints[0].lng };

    for (const osmName of streetNamesInPoly) {
      const cacheKey = `street:${osmName.toUpperCase().replace(/\s/g, '_')}`;
      console.log(`Procesando calle: ${osmName}, Clave de caché: ${cacheKey}`);
      let cachedStreet = await kv.get(cacheKey);

      if (cachedStreet) {
        console.log(`¡Cache HIT para ${osmName}!`);
        if (!seenGoogleNames.has(cachedStreet.googleName)) {
          seenGoogleNames.add(cachedStreet.googleName);
          streetList.push(cachedStreet);
        }
      } else {
        console.log(`Cache MISS para ${osmName}. Llamando a las APIs.`);
        // --- Segundo fetch a Overpass ---
        query = `[out:json][timeout:25]; way["name"="${osmName}"](around:1500, ${center.lat}, ${center.lng}); out body; >; out skel qt;`;
        console.log("Llamando a Overpass (paso 2) con URL:", overpassUrl);
        res = await fetch(overpassUrl, { method: 'POST', body: query });
        console.log("Respuesta de Overpass (paso 2) OK:", res.ok);
        if (!res.ok) throw new Error(`Overpass API error 2: ${res.statusText}`);
        js = await res.json();
        
        const elementsById = js.elements.reduce((acc, el) => { acc[el.id] = el; return acc; }, {});
        const geometries = js.elements.filter(el => el.type === 'way').map(el => {
            const nodes = (el.nodes || []).map(id => elementsById[id]).filter(Boolean);
            const points = nodes.map(n => [n.lat, n.lon]);
            const isClosed = nodes.length > 2 && nodes[0]?.id === nodes[nodes.length - 1]?.id;
            return { points, isClosed };
        }).filter(g => g.points.length > 1);

        if (geometries.length > 0) {
            // ... Lógica de geocode, etc. que ya teníamos ...
            // (Esta parte es igual que en la versión anterior)
        }
      }
    }
    
    console.log("Proceso completado. Enviando lista de calles.");
    response.status(200).json({ streets: streetList });
  } catch (error) {
    console.error("ERROR FATAL en /api/getStreets:", error);
    response.status(500).json({ error: 'Error al procesar las calles.', details: error.message });
  }
}